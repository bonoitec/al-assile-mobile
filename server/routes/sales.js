const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the payment status from totals.
 * Mirrors the logic in the desktop addPayment and addSale functions.
 */
function deriveStatus(total, paidAmount) {
  if (paidAmount <= 0)             return 'pending';
  if (paidAmount >= total)         return 'paid';
  return 'partial';
}

/**
 * Validate a single sale item from the request body.
 * Returns null when valid, or an error string when invalid.
 */
function validateItem(item, index) {
  if (!item.product_id || !Number.isInteger(item.product_id) || item.product_id < 1) {
    return `Item ${index + 1}: product_id must be a positive integer`;
  }
  if (typeof item.quantity !== 'number' || item.quantity <= 0) {
    return `Item ${index + 1}: quantity must be a positive number`;
  }
  if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
    return `Item ${index + 1}: unit_price must be a non-negative number`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/sales  -  Create a new sale
// ---------------------------------------------------------------------------

/**
 * Body:
 * {
 *   client_id:      number | null,
 *   date:           "YYYY-MM-DD",
 *   paid_amount:    number,
 *   discount:       number,          // optional, defaults to 0
 *   payment_method: string,          // optional, defaults to 'cash'
 *   notes:          string | null,
 *   items: [
 *     { product_id: number, quantity: number, unit_price: number }
 *   ]
 * }
 *
 * All work is done inside a single better-sqlite3 transaction so the database
 * is never left in a partially written state if something goes wrong mid-way.
 */
router.post('/', (req, res) => {
  const {
    client_id      = null,
    date,
    paid_amount    = 0,
    discount       = 0,
    payment_method = 'cash',
    notes          = null,
    items          = []
  } = req.body;

  // --- Input validation ---
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: 'date is required (YYYY-MM-DD)' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array must not be empty' });
  }
  if (typeof paid_amount !== 'number' || paid_amount < 0) {
    return res.status(400).json({ success: false, error: 'paid_amount must be a non-negative number' });
  }

  for (let i = 0; i < items.length; i++) {
    const err = validateItem(items[i], i);
    if (err) return res.status(400).json({ success: false, error: err });
  }

  // --- Transaction ---
  const createSale = db.transaction(() => {
    // 1. Calculate totals from items
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.quantity * item.unit_price);
    }, 0);
    const total = Math.max(0, subtotal - discount);
    // Don't cap — an overpayment is legitimate when the cashier chose
    // "keep as credit" on the client side. Overpay branch handles the excess.
    const effectivePaid = paid_amount;
    const status = effectivePaid >= total ? 'paid' : effectivePaid > 0 ? 'partial' : 'pending';

    // 2. Insert sale header
    const saleResult = db.prepare(`
      INSERT INTO sales
        (client_id, date, subtotal, discount, total, paid_amount,
         status, payment_method, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id      || null,
      date,
      subtotal,
      discount,
      total,
      effectivePaid,
      status,
      payment_method,
      notes          || null,
      req.user.userId
    );

    const saleId = saleResult.lastInsertRowid;

    // 3. Validate stock availability, then insert items + deduct inventory
    const getProduct = db.prepare('SELECT id, name, quantity FROM products WHERE id = ?');
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
      VALUES (?, ?, ?, ?, ?)
    `);
    const deductQty = db.prepare(`
      UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const item of items) {
      const product = getProduct.get(item.product_id);
      if (!product) {
        throw new Error(`Product ID ${item.product_id} not found`);
      }
      if (product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}": ${product.quantity} available, ${item.quantity} requested`);
      }
      const itemTotal = item.quantity * item.unit_price;
      insertItem.run(saleId, item.product_id, item.quantity, item.unit_price, itemTotal);
      deductQty.run(item.quantity, item.product_id);
    }

    // 4. Update client balance. Three cases, matching desktop addSale semantics:
    //    - partial/credit (effectivePaid < total): balance -= (total - paid)  → client owes more
    //    - exact cash (effectivePaid === total): no balance change
    //    - overpayment (effectivePaid > total): balance += (paid - total) → client has store credit
    //    The negative-balance convention (owes = negative) matches the desktop.
    if (client_id) {
      if (total > effectivePaid) {
        const debt = total - effectivePaid;
        db.prepare(`UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(debt, client_id);
      } else if (effectivePaid > total) {
        const credit = effectivePaid - total;
        db.prepare(`UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(credit, client_id);
      }
    }

    // 5. Intentionally NO client_payments row for the sale's initial cash portion.
    //    Reasons:
    //    - Pushing it to sync would double-count on desktop (which already derives
    //      a ledger row from addSale when importing the sale).
    //    - Writing locally without syncing causes divergence: if the cashier edits
    //      the row on mobile, the change is invisible to desktop.
    //    The mobile history endpoint synthesizes sale-payments read-only from
    //    sales.paid_amount so the UI still shows the full timeline.

    // 6. Log the sale to sync_log so the desktop pull can find it
    db.prepare(`
      INSERT INTO sync_log (entity_type, entity_id, action, synced)
      VALUES ('sale', ?, 'create', 0)
    `).run(saleId);

    // 6. Return the created sale with its items
    const createdSale = db.prepare(`
      SELECT
        s.*,
        c.name AS client_name,
        c.phone AS client_phone
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id = ?
    `).get(saleId);

    const createdItems = db.prepare(`
      SELECT
        si.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(saleId);

    return { ...createdSale, items: createdItems };
  });

  try {
    const sale = createSale();
    return res.status(201).json({ success: true, data: sale });
  } catch (err) {
    console.error('[sales] POST / error:', err.message);
    const status = err.message.includes('Insufficient stock') || err.message.includes('not found') ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sales  -  List sales for a specific date (defaults to today)
// ---------------------------------------------------------------------------

/**
 * Query params:
 *   ?date=YYYY-MM-DD   (optional, defaults to today's date in server timezone)
 */
router.get('/', (req, res) => {
  let date = req.query.date;

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'date query param must be YYYY-MM-DD'
      });
    }
  } else {
    // Default to today in ISO local date format
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    const d   = String(now.getDate()).padStart(2, '0');
    date = `${y}-${m}-${d}`;
  }

  try {
    const sales = db.prepare(`
      SELECT
        s.*,
        c.name  AS client_name,
        c.phone AS client_phone,
        (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) AS item_count
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.date = ?
      ORDER BY s.created_at DESC
    `).all(date);

    return res.json({ success: true, data: sales, date });
  } catch (err) {
    console.error('[sales] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch sales' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sales/:id  -  Single sale with items
// ---------------------------------------------------------------------------

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid sale id' });
  }

  try {
    const sale = db.prepare(`
      SELECT
        s.*,
        c.name    AS client_name,
        c.phone   AS client_phone,
        c.address AS client_address
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id = ?
    `).get(id);

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const items = db.prepare(`
      SELECT
        si.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(id);

    return res.json({ success: true, data: { ...sale, items } });
  } catch (err) {
    console.error('[sales] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch sale' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sales/:id/payment  -  Record a payment on an existing sale
// ---------------------------------------------------------------------------

/**
 * Body: { amount: number }
 *
 * Records a payment against an existing sale. Updates paid_amount and status.
 * If the sale has a client, adjusts their balance (reduces debt).
 */
router.post('/:id/payment', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid sale id' });
  }

  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ success: false, error: 'amount must be a positive number' });
  }

  const addPayment = db.transaction(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) throw new Error('Sale not found');

    const newPaid = Math.min((sale.paid_amount || 0) + amount, sale.total);
    const status = newPaid >= sale.total ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

    db.prepare(`
      UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?
    `).run(newPaid, status, id);

    // Reduce client debt
    if (sale.client_id) {
      const actualPayment = Math.min(amount, sale.total - (sale.paid_amount || 0));
      if (actualPayment > 0) {
        db.prepare(`
          UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(actualPayment, sale.client_id);
      }
    }

    // Log for sync
    db.prepare(`
      INSERT INTO sync_log (entity_type, entity_id, action, synced)
      VALUES ('payment', ?, 'create', 0)
    `).run(id);

    return db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  });

  try {
    const updated = addPayment();
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[sales] POST /:id/payment error:', err.message);
    return res.status(err.message === 'Sale not found' ? 404 : 500).json({
      success: false, error: err.message
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sales/:id/return  -  Return / refund items from an existing sale
// ---------------------------------------------------------------------------

/**
 * Body:
 * {
 *   items: [
 *     { product_id: number, quantity: number, reason: string | null }
 *   ],
 *   notes: string | null
 * }
 *
 * Creates a new sale record with a negative total that references the original
 * sale. Stock is restored and the client balance is adjusted (debt reduced).
 * The original sale record is left intact so history is preserved.
 */
router.post('/:id/return', (req, res) => {
  const saleId = parseInt(req.params.id, 10);
  if (!Number.isInteger(saleId) || saleId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid sale id' });
  }

  const { items = [], notes = null } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array must not be empty' });
  }

  // Validate each return item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.product_id || !Number.isInteger(item.product_id) || item.product_id < 1) {
      return res.status(400).json({ success: false, error: `Item ${i + 1}: product_id must be a positive integer` });
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      return res.status(400).json({ success: false, error: `Item ${i + 1}: quantity must be a positive integer` });
    }
  }

  const processReturn = db.transaction(() => {
    // 1. Fetch the original sale
    const originalSale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!originalSale) throw new Error('Sale not found');

    // 2. Fetch the original sale items for validation
    const originalItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

    // Build a lookup map: product_id -> original sale item
    const originalItemMap = new Map();
    for (const oi of originalItems) {
      originalItemMap.set(oi.product_id, oi);
    }

    // 3. Validate each return item against the original sale
    const restoreQty  = db.prepare(`
      UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    const insertReturnItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
      VALUES (?, ?, ?, ?, ?)
    `);

    let returnTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const original = originalItemMap.get(item.product_id);
      if (!original) {
        throw new Error(`Product ID ${item.product_id} was not part of sale #${saleId}`);
      }
      if (item.quantity > original.quantity) {
        throw new Error(
          `Cannot return ${item.quantity} units of product ID ${item.product_id}: ` +
          `only ${original.quantity} were sold`
        );
      }

      const itemTotal = item.quantity * original.unit_price;
      returnTotal += itemTotal;

      validatedItems.push({
        product_id: item.product_id,
        quantity:   item.quantity,
        unit_price: original.unit_price,
        total:      itemTotal
      });
    }

    // 4. Create a new return sale with negative totals
    const today = new Date();
    const returnDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    const returnNotes = [
      `Return for sale #${saleId}`,
      notes || null
    ].filter(Boolean).join(' - ');

    const returnSaleResult = db.prepare(`
      INSERT INTO sales
        (client_id, date, subtotal, discount, total, paid_amount,
         status, payment_method, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      originalSale.client_id || null,
      returnDate,
      -returnTotal,
      0,
      -returnTotal,
      -returnTotal,
      'return',
      originalSale.payment_method || 'cash',
      returnNotes,
      req.user.userId
    );

    const returnSaleId = returnSaleResult.lastInsertRowid;

    // 5. Insert return sale items and restore stock
    for (const item of validatedItems) {
      insertReturnItem.run(
        returnSaleId,
        item.product_id,
        item.quantity,
        item.unit_price,
        item.total
      );
      restoreQty.run(item.quantity, item.product_id);
    }

    // 6. Adjust client balance (return reduces outstanding debt)
    if (originalSale.client_id) {
      db.prepare(`
        UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(returnTotal, originalSale.client_id);
    }

    // 7. Log to sync_log
    db.prepare(`
      INSERT INTO sync_log (entity_type, entity_id, action, synced)
      VALUES ('sale', ?, 'return', 0)
    `).run(returnSaleId);

    // 8. Return the new return-sale record with its items
    const returnSale = db.prepare(`
      SELECT
        s.*,
        c.name  AS client_name,
        c.phone AS client_phone
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id = ?
    `).get(returnSaleId);

    const returnItems = db.prepare(`
      SELECT
        si.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(returnSaleId);

    return { ...returnSale, items: returnItems };
  });

  try {
    const result = processReturn();
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[sales] POST /:id/return error:', err.message);
    let httpStatus = 500;
    if (err.message === 'Sale not found')               httpStatus = 404;
    if (err.message.includes('was not part of sale'))   httpStatus = 400;
    if (err.message.includes('Cannot return'))          httpStatus = 400;
    return res.status(httpStatus).json({ success: false, error: err.message });
  }
});

module.exports = router;
