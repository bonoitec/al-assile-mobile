const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

// ---------------------------------------------------------------------------
// Security - X-Sync-Key header validation
// ---------------------------------------------------------------------------

const SYNC_API_KEY = process.env.SYNC_API_KEY || 'al-assile-sync-key-change-me';

/**
 * requireSyncKey - middleware that validates the X-Sync-Key header.
 * Applied to every route in this router.
 * A missing or wrong key returns 401 without leaking the expected value.
 */
function requireSyncKey(req, res, next) {
  const provided = req.headers['x-sync-key'];
  if (!provided || provided !== SYNC_API_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid or missing X-Sync-Key' });
  }
  next();
}

router.use(requireSyncKey);

// ---------------------------------------------------------------------------
// POST /api/sync/push
// Desktop → Mobile: replace reference data
// ---------------------------------------------------------------------------

/**
 * Full replacement of products, clients, users, and settings from the desktop.
 * Sales and sale_items are intentionally untouched.
 *
 * Body: {
 *   products: Product[],    // full rows including image_data (base64)
 *   clients:  Client[],
 *   users:    User[],       // password_hash already hashed on desktop
 *   settings: { key, value }[]
 * }
 *
 * Quantity reconciliation:
 *   The desktop sends the current quantity for each product as it knows it.
 *   Any sales created on the mobile side since the last sync have already
 *   deducted from the local products table.  After replacing the products
 *   table with the desktop snapshot, we subtract those unsynced mobile sales
 *   again so inventory stays accurate.
 *
 * Returns: { success: true, counts: { products, clients, users, settings } }
 */
router.post('/push', (req, res) => {
  const {
    products = [],
    clients  = [],
    users    = [],
    settings = []
  } = req.body;

  // Basic shape validation - the desktop should always send arrays
  if (!Array.isArray(products) || !Array.isArray(clients) ||
      !Array.isArray(users)    || !Array.isArray(settings)) {
    return res.status(400).json({
      success: false,
      error: 'products, clients, users, and settings must all be arrays'
    });
  }

  // Temporarily disable foreign key checks during bulk replacement
  // (sales reference products and clients that we're about to replace)
  // Must be set OUTSIDE the transaction for SQLite to honor it
  db.pragma('foreign_keys = OFF');

  const push = db.transaction(() => {
    // 1. Collect unsynced mobile sale items BEFORE wiping products,
    //    so we can re-apply the quantity deductions afterward.
    //    We group by product_id to get total deduction per product.
    const unsyncedDeductions = db.prepare(`
      SELECT si.product_id, SUM(si.quantity) AS total_qty
      FROM sale_items si
      JOIN sync_log sl ON sl.entity_type = 'sale' AND sl.entity_id = si.sale_id
      WHERE sl.synced = 0
      GROUP BY si.product_id
    `).all();

    // Build a lookup map: product_id -> quantity_to_deduct
    const deductionMap = {};
    for (const row of unsyncedDeductions) {
      deductionMap[row.product_id] = row.total_qty;
    }

    // 2. Replace products
    db.prepare('DELETE FROM products').run();
    const insertProduct = db.prepare(`
      INSERT INTO products
        (id, name, description, selling_price, unit, barcode,
         is_favorite, image_data, is_active, quantity,
         min_stock_alert, is_resale, purchase_price, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of products) {
      insertProduct.run(
        p.id,
        p.name,
        p.description   || null,
        p.selling_price  || 0,
        p.unit           || 'pcs',
        p.barcode        || null,
        p.is_favorite    ? 1 : 0,
        p.image_data     || null,
        p.is_active !== undefined ? (p.is_active ? 1 : 0) : 1,
        p.quantity       || 0,
        p.min_stock_alert || 0,
        p.is_resale      ? 1 : 0,
        p.purchase_price || 0,
        p.created_at     || new Date().toISOString(),
        p.updated_at     || new Date().toISOString()
      );
    }

    // 3. Apply unsynced mobile quantity deductions so stock counts are accurate
    const deductQty = db.prepare(`
      UPDATE products
      SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    for (const [productId, qty] of Object.entries(deductionMap)) {
      deductQty.run(qty, parseInt(productId, 10));
    }

    // 4. Replace clients
    db.prepare('DELETE FROM clients').run();
    const insertClient = db.prepare(`
      INSERT INTO clients
        (id, name, phone, address, email, notes, balance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of clients) {
      insertClient.run(
        c.id,
        c.name,
        c.phone      || null,
        c.address    || null,
        c.email      || null,
        c.notes      || null,
        c.balance    || 0,
        c.created_at || new Date().toISOString(),
        c.updated_at || new Date().toISOString()
      );
    }

    // 5. Replace users - passwords arrive already hashed from the desktop
    db.prepare('DELETE FROM users').run();
    const insertUser = db.prepare(`
      INSERT INTO users
        (id, username, password_hash, name, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of users) {
      if (!u.password_hash) {
        throw new Error(`User ${u.username} is missing password_hash`);
      }
      insertUser.run(
        u.id,
        u.username,
        u.password_hash,
        u.name,
        u.role          || 'sales',
        u.is_active !== undefined ? (u.is_active ? 1 : 0) : 1,
        u.created_at    || new Date().toISOString()
      );
    }

    // 6. Replace settings
    db.prepare('DELETE FROM settings').run();
    const insertSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
    `);
    for (const s of settings) {
      if (s.key !== undefined) {
        insertSetting.run(s.key, s.value !== undefined ? String(s.value) : null);
      }
    }

    return {
      products: products.length,
      clients:  clients.length,
      users:    users.length,
      settings: settings.length
    };
  });

  try {
    const counts = push();
    db.pragma('foreign_keys = ON');
    console.log('[sync] Push complete:', counts);
    return res.json({ success: true, counts });
  } catch (err) {
    db.pragma('foreign_keys = ON');
    console.error('[sync] POST /push error:', err.message);
    return res.status(500).json({ success: false, error: 'Sync push failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sync/pull?since=<ISO timestamp>
// Mobile → Desktop: return unsynced sales with items
// ---------------------------------------------------------------------------

/**
 * Query params:
 *   since  (optional) - ISO 8601 timestamp.  When provided, only sales created
 *                       after this timestamp are returned.  When omitted, all
 *                       unsynced sales are returned.
 *
 * The route marks returned rows as synced = 1 inside the same transaction that
 * reads them, so the desktop will never see the same sale twice on a retry.
 *
 * Returns:
 * {
 *   success: true,
 *   sales: [
 *     { ...saleFields, items: [...saleItemFields] }
 *   ]
 * }
 */
router.get('/pull', (req, res) => {
  const since = req.query.since || null;

  // If provided, validate format loosely (full ISO string or YYYY-MM-DD)
  if (since && !/^\d{4}-\d{2}-\d{2}/.test(since)) {
    return res.status(400).json({
      success: false,
      error: 'since must be an ISO 8601 timestamp (e.g. 2025-01-01T00:00:00.000Z)'
    });
  }

  const pull = db.transaction(() => {
    // 1. Find unsynced sale IDs
    let unsyncedRows;
    if (since) {
      unsyncedRows = db.prepare(`
        SELECT DISTINCT entity_id AS sale_id
        FROM sync_log
        WHERE entity_type = 'sale' AND synced = 0 AND created_at > ?
      `).all(since);
    } else {
      unsyncedRows = db.prepare(`
        SELECT DISTINCT entity_id AS sale_id
        FROM sync_log
        WHERE entity_type = 'sale' AND synced = 0
      `).all();
    }

    if (unsyncedRows.length === 0) {
      return [];
    }

    const saleIds = unsyncedRows.map(r => r.sale_id);

    // 2. Fetch the full sale rows
    //    SQLite does not support parameter binding for IN clauses with arrays,
    //    so we build the placeholders safely from a validated integer list.
    const safePlaceholders = saleIds.map(() => '?').join(',');
    const sales = db.prepare(`
      SELECT
        s.*,
        c.name    AS client_name,
        c.phone   AS client_phone,
        c.address AS client_address
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id IN (${safePlaceholders})
      ORDER BY s.created_at ASC
    `).all(...saleIds);

    // 3. Fetch items for all returned sales in one query
    const allItems = db.prepare(`
      SELECT
        si.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id IN (${safePlaceholders})
    `).all(...saleIds);

    // Build a map so we can attach items to each sale without N+1 queries
    const itemsBySaleId = {};
    for (const item of allItems) {
      if (!itemsBySaleId[item.sale_id]) {
        itemsBySaleId[item.sale_id] = [];
      }
      itemsBySaleId[item.sale_id].push(item);
    }

    const result = sales.map(sale => ({
      ...sale,
      items: itemsBySaleId[sale.id] || []
    }));

    // 4. Mark these sales as synced
    db.prepare(`
      UPDATE sync_log
      SET synced = 1
      WHERE entity_type = 'sale'
        AND entity_id IN (${safePlaceholders})
    `).run(...saleIds);

    return result;
  });

  try {
    const sales = pull();
    return res.json({ success: true, sales });
  } catch (err) {
    console.error('[sync] GET /pull error:', err.message);
    return res.status(500).json({ success: false, error: 'Sync pull failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sync/status
// Quick health check for the desktop to verify connectivity before syncing
// ---------------------------------------------------------------------------

router.get('/status', (req, res) => {
  try {
    const pendingCount = db.prepare(`
      SELECT COUNT(DISTINCT entity_id) AS count
      FROM sync_log
      WHERE entity_type = 'sale' AND synced = 0
    `).get();

    const lastSale = db.prepare(`
      SELECT created_at FROM sales ORDER BY created_at DESC LIMIT 1
    `).get();

    return res.json({
      success:          true,
      pending_sales:    pendingCount.count,
      last_sale_at:     lastSale ? lastSale.created_at : null,
      server_time:      new Date().toISOString()
    });
  } catch (err) {
    console.error('[sync] GET /status error:', err.message);
    return res.status(500).json({ success: false, error: 'Status check failed' });
  }
});

module.exports = router;
