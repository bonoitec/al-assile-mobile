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
    products          = [],
    clients           = [],
    suppliers         = [],
    supplier_payments = [],
    sales             = [],
    sale_items        = [],
    client_payments   = [],
    users             = [],
    settings          = []
  } = req.body;

  // Basic shape validation - the desktop should always send arrays
  if (!Array.isArray(products) || !Array.isArray(clients) ||
      !Array.isArray(users)    || !Array.isArray(settings) ||
      !Array.isArray(suppliers) || !Array.isArray(supplier_payments) ||
      !Array.isArray(sales) || !Array.isArray(sale_items) ||
      !Array.isArray(client_payments)) {
    return res.status(400).json({
      success: false,
      error: 'all payload arrays required (products, clients, suppliers, supplier_payments, sales, sale_items, client_payments, users, settings)'
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

    // 4. Reconcile clients. Previously this was DELETE + re-INSERT, which
    //    wiped mobile-originated clients (those have sync_log entries and
    //    need to survive until the desktop pulls them). New strategy:
    //      a) Preserve mobile clients that haven't been pulled yet
    //         (their sync_log entry is still synced=0).
    //      b) Wipe the rest and re-insert from the desktop payload.
    //    Mobile-created clients carry remote_id = their own mobile id; the
    //    desktop assigns them a local id after pulling. Once the desktop
    //    pushes again, the mobile client's remote_id matches so we preserve.
    const pendingClientIds = new Set(
      db.prepare(`SELECT DISTINCT entity_id FROM sync_log
                  WHERE entity_type='client' AND synced=0`).all().map(r => r.entity_id)
    );

    // Snapshot (old_id → remote_id) BEFORE the wipe so we can remap mobile
    // sales after the reinsert. This handles the case where the desktop has
    // re-assigned a mobile-originated client a new local id: mobile.sale
    // pointed at old id=5, desktop pushes id=7 with remote_id='5', we need
    // to update sales.client_id from 5 → 7 after the new client lands.
    const oldClientsById = new Map(
      db.prepare('SELECT id, remote_id FROM clients WHERE remote_id IS NOT NULL').all()
        .map(r => [r.id, r.remote_id])
    );

    if (pendingClientIds.size > 0) {
      const ph = [...pendingClientIds].map(() => '?').join(',');
      db.prepare(`DELETE FROM clients WHERE id NOT IN (${ph})`).run(...pendingClientIds);
    } else {
      db.prepare('DELETE FROM clients').run();
    }
    const insertClient = db.prepare(`
      INSERT OR REPLACE INTO clients
        (id, name, phone, address, email, notes, balance,
         credit_blocked, last_contact_note, last_contact_at, remote_id,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of clients) {
      // Skip incoming rows that would collide with a pending mobile-created
      // one (ID clash: desktop assigned the same id before pulling). The
      // desktop re-syncs them in a later push once it knows the mapping.
      if (pendingClientIds.has(c.id)) continue;
      insertClient.run(
        c.id,
        c.name,
        c.phone             || null,
        c.address           || null,
        c.email             || null,
        c.notes             || null,
        c.balance           || 0,
        c.credit_blocked ? 1 : 0,
        c.last_contact_note || null,
        c.last_contact_at   || null,
        c.remote_id         || null,
        c.created_at        || new Date().toISOString(),
        c.updated_at        || new Date().toISOString()
      );
    }

    // 4b. Remap any mobile sales / payments that referenced old client ids
    //     via remote_id. E.g. mobile originally had client id=5 (mobile-origin,
    //     remote_id='5'). Desktop pulled it and re-keyed it to local id=7,
    //     then pushed back with id=7 remote_id='5'. Mobile sales still have
    //     client_id=5 — rewrite them to point at the new id (7).
    if (oldClientsById.size > 0) {
      const remapSale = db.prepare('UPDATE sales SET client_id = ? WHERE client_id = ?');
      const remapPayment = db.prepare('UPDATE client_payments SET client_id = ? WHERE client_id = ?');
      const findByRemote = db.prepare('SELECT id FROM clients WHERE remote_id = ?');
      for (const [oldId, remoteId] of oldClientsById.entries()) {
        const fresh = findByRemote.get(remoteId);
        if (fresh && fresh.id !== oldId) {
          remapSale.run(fresh.id, oldId);
          remapPayment.run(fresh.id, oldId);
        }
      }
    }

    // 4c. Reconcile suppliers. Mirror the clients strategy: preserve any
    //     mobile-created supplier whose sync_log entry hasn't been consumed
    //     by the desktop yet (synced=0), then wipe+reinsert the rest from
    //     the desktop snapshot. Mobile-origin suppliers carry remote_id =
    //     their own mobile id and get remapped once desktop assigns a local id.
    const pendingSupplierIds = new Set(
      db.prepare(`SELECT DISTINCT entity_id FROM sync_log
                  WHERE entity_type='supplier' AND synced=0`).all().map(r => r.entity_id)
    );
    const oldSuppliersById = new Map(
      db.prepare('SELECT id, remote_id FROM suppliers WHERE remote_id IS NOT NULL').all()
        .map(r => [r.id, r.remote_id])
    );

    if (pendingSupplierIds.size > 0) {
      const ph = [...pendingSupplierIds].map(() => '?').join(',');
      db.prepare(`DELETE FROM suppliers WHERE id NOT IN (${ph})`).run(...pendingSupplierIds);
    } else {
      db.prepare('DELETE FROM suppliers').run();
    }
    const insertSupplier = db.prepare(`
      INSERT OR REPLACE INTO suppliers
        (id, name, phone, address, email, notes, balance, remote_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of suppliers) {
      // Skip rows that would collide with a pending mobile-created one.
      if (pendingSupplierIds.has(s.id)) continue;
      insertSupplier.run(
        s.id,
        s.name,
        s.phone      || null,
        s.address    || null,
        s.email      || null,
        s.notes      || null,
        s.balance    || 0,
        s.remote_id  || null,
        s.created_at || new Date().toISOString(),
        s.updated_at || new Date().toISOString()
      );
    }

    // 4d. Remap any mobile supplier_payments that referenced old supplier
    //     ids via remote_id. Same rationale as the sales/payments remap above:
    //     desktop may have re-keyed a mobile-origin supplier to a new local id
    //     and pushed it back. Mobile rows still point at the old id.
    if (oldSuppliersById.size > 0) {
      const remapSP = db.prepare('UPDATE supplier_payments SET supplier_id = ? WHERE supplier_id = ?');
      const findByRemote = db.prepare('SELECT id FROM suppliers WHERE remote_id = ?');
      for (const [oldId, remoteId] of oldSuppliersById.entries()) {
        const fresh = findByRemote.get(remoteId);
        if (fresh && fresh.id !== oldId) {
          remapSP.run(fresh.id, oldId);
        }
      }
    }

    // 4e. Reconcile supplier_payments. Same preserve-pending strategy as
    //     clients/suppliers: mobile-created payments that haven't been pulled
    //     up by desktop yet must survive the wipe.
    const pendingSPIds = new Set(
      db.prepare(`SELECT DISTINCT entity_id FROM sync_log
                  WHERE entity_type='supplier_payment' AND synced=0`).all().map(r => r.entity_id)
    );
    if (pendingSPIds.size > 0) {
      const ph = [...pendingSPIds].map(() => '?').join(',');
      db.prepare(`DELETE FROM supplier_payments WHERE id NOT IN (${ph})`).run(...pendingSPIds);
    } else {
      db.prepare('DELETE FROM supplier_payments').run();
    }
    const insertSP = db.prepare(`
      INSERT OR REPLACE INTO supplier_payments
        (id, supplier_id, purchase_id, amount, date, method, notes,
         batch_id, created_by, remote_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const sp of supplier_payments) {
      if (pendingSPIds.has(sp.id)) continue;
      // Guard: if the referenced supplier wasn't inserted (e.g. it was in the
      // pending mobile set and we skipped the collision), drop this payment.
      // Without FK on supplier_id we'd orphan it silently; explicit check.
      const supExists = db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get(sp.supplier_id);
      if (!supExists) continue;
      insertSP.run(
        sp.id,
        sp.supplier_id,
        sp.purchase_id || null,
        sp.amount,
        sp.date,
        sp.method      || 'cash',
        sp.notes       || null,
        sp.batch_id    || null,
        sp.created_by  || null,
        sp.remote_id   || null,
        sp.created_at  || new Date().toISOString()
      );
    }

    // 4f. Reconcile desktop-origin sales. Mobile-origin sales (those created
    //     via POST /api/sales) keep remote_id NULL and must NEVER be touched
    //     here — they're the authoritative copy until desktop pulls them.
    //     Desktop-origin sales carry remote_id='desktop-{id}' on mobile; we
    //     wipe+reinsert that subset on each push so updated totals, status
    //     changes, and deletions propagate cleanly.
    const oldDesktopSaleIds = db.prepare(
      `SELECT id FROM sales WHERE remote_id LIKE 'desktop-%'`
    ).all().map(r => r.id);
    if (oldDesktopSaleIds.length > 0) {
      const ph = oldDesktopSaleIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM sale_items WHERE sale_id IN (${ph})`).run(...oldDesktopSaleIds);
      db.prepare(`DELETE FROM sales WHERE id IN (${ph})`).run(...oldDesktopSaleIds);
    }

    // Build id sets once rather than querying per-row — N+1 perf trap with
    // large sales histories (90d × 100/day = 9K sale_items).
    const validClientIds = new Set(
      db.prepare('SELECT id FROM clients').all().map(r => r.id)
    );
    const validProductIds = new Set(
      db.prepare('SELECT id FROM products').all().map(r => r.id)
    );

    const insertSale = db.prepare(`
      INSERT INTO sales
        (client_id, date, subtotal, discount, total, paid_amount, status,
         payment_method, notes, created_by, remote_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Map desktop sale id → mobile's freshly assigned local id so we can
    // stitch sale_items to the correct parent row after insert.
    const desktopSaleIdMap = new Map();
    for (const s of sales) {
      // Walk-in sales have client_id=NULL; only validate when non-null.
      if (s.client_id != null && !validClientIds.has(s.client_id)) continue;
      const info = insertSale.run(
        s.client_id  || null,
        s.date,
        s.subtotal    || 0,
        s.discount    || 0,
        s.total       || 0,
        s.paid_amount || 0,
        s.status      || 'paid',
        s.payment_method || 'cash',
        s.notes       || null,
        s.created_by  || null,
        `desktop-${s.id}`,
        s.created_at  || new Date().toISOString()
      );
      desktopSaleIdMap.set(s.id, info.lastInsertRowid);
    }

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    let saleItemsImported = 0;
    for (const it of sale_items) {
      const newSaleId = desktopSaleIdMap.get(it.sale_id);
      if (!newSaleId) continue; // orphan item whose parent sale was skipped
      if (!validProductIds.has(it.product_id)) continue;
      insertSaleItem.run(
        newSaleId,
        it.product_id,
        it.quantity,
        it.unit_price,
        it.total,
        it.created_at || new Date().toISOString()
      );
      saleItemsImported++;
    }

    // 4g. Reconcile desktop-origin client_payments. Same approach as sales:
    //     wipe the remote_id LIKE 'desktop-%' subset, re-insert from payload,
    //     remap sale_id via desktopSaleIdMap (desktop's sale id → mobile's
    //     newly-assigned sale id). Mobile-origin payments (remote_id NULL)
    //     stay untouched — they're pending pickup by desktop's next pull.
    const oldDesktopPaymentIds = db.prepare(
      `SELECT id FROM client_payments WHERE remote_id LIKE 'desktop-%'`
    ).all().map(r => r.id);
    if (oldDesktopPaymentIds.length > 0) {
      const ph = oldDesktopPaymentIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM client_payments WHERE id IN (${ph})`).run(...oldDesktopPaymentIds);
    }

    const insertPayment = db.prepare(`
      INSERT INTO client_payments
        (client_id, sale_id, amount, date, method, notes, batch_id, created_by, remote_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let clientPaymentsImported = 0;
    for (const cp of client_payments) {
      // Skip payments whose client wasn't inserted (pending collision).
      if (!validClientIds.has(cp.client_id)) continue;
      // Remap sale_id if this payment references a desktop-origin sale that
      // just got a new mobile id. NULL sale_id = on-account credit, leave null.
      let mobileSaleId = null;
      if (cp.sale_id != null) {
        mobileSaleId = desktopSaleIdMap.get(cp.sale_id) || null;
        // If mapping missing, the sale might predate the 30-day window and
        // not have been pushed. Drop the payment to avoid dangling ledger.
        if (!mobileSaleId) continue;
      }
      insertPayment.run(
        cp.client_id,
        mobileSaleId,
        cp.amount,
        cp.date,
        cp.method     || 'cash',
        cp.notes      || null,
        cp.batch_id   || null,
        cp.created_by || null,
        `desktop-${cp.id}`,
        cp.created_at || new Date().toISOString()
      );
      clientPaymentsImported++;
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
      products:          products.length,
      clients:           clients.length,
      suppliers:         suppliers.length,
      supplier_payments: supplier_payments.length,
      sales:             desktopSaleIdMap.size,
      sale_items:        saleItemsImported,
      client_payments:   clientPaymentsImported,
      users:             users.length,
      settings:          settings.length
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
    // ------------------------- SALES -------------------------
    // The desktop's `since` watermark is the trusted marker of what it has
    // already received. We do NOT filter by `synced = 0` — that would turn
    // a crashed/dropped pull into permanent data loss (the server would mark
    // the row synced even if the desktop never persisted it). The desktop
    // uses `sales.remote_id` for idempotency, so replaying is safe.
    //
    // datetime() normalizes both sides — sync_log.created_at is SQLite's
    // "YYYY-MM-DD HH:MM:SS" (space separator) while `since` comes in as
    // ISO 8601 with T/Z. Raw string comparison mis-sorts them because
    // ' ' (0x20) < 'T' (0x54), so newer rows look older.
    // Collect all sale log events (create, delete) so we can emit an __action
    // per sale. The `since` watermark filters by timestamp; the UPDATE to mark
    // synced=1 is cosmetic (desktop dedupes by remote_id).
    const saleLogRows = since
      ? db.prepare(`SELECT entity_id AS sale_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'sale' AND datetime(created_at) > datetime(?)
                    ORDER BY id ASC`).all(since)
      : db.prepare(`SELECT entity_id AS sale_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'sale' AND synced = 0
                    ORDER BY id ASC`).all();

    // Latest action per sale wins (e.g. create then delete → tombstone)
    const latestSaleAction = new Map();
    const saleLogIds = [];
    for (const r of saleLogRows) {
      latestSaleAction.set(r.sale_id, r.action);
      saleLogIds.push(r.log_id);
    }
    const saleIds = [...latestSaleAction.keys()];

    let salesOut = [];
    if (saleIds.length > 0) {
      const ph = saleIds.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT s.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address
        FROM sales s LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.id IN (${ph})
        ORDER BY s.created_at ASC
      `).all(...saleIds);

      const items = db.prepare(`
        SELECT si.*, p.name AS product_name, p.unit AS product_unit
        FROM sale_items si LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id IN (${ph})
      `).all(...saleIds);

      const itemsBySaleId = {};
      for (const it of items) (itemsBySaleId[it.sale_id] ||= []).push(it);

      const existingBySaleId = new Map(rows.map(r => [r.id, r]));

      for (const sid of saleIds) {
        const action = latestSaleAction.get(sid);
        const row = existingBySaleId.get(sid);
        if (action === 'delete') {
          // Row is gone; emit a tombstone so the desktop can reverse its copy.
          salesOut.push({ id: sid, __action: 'delete' });
        } else if (row) {
          salesOut.push({ ...row, items: itemsBySaleId[sid] || [], __action: action || 'create' });
        }
        // If create/update but the row is gone (shouldn't happen), we simply
        // skip — the log is still consumed and the desktop has no work to do.
      }

      if (saleLogIds.length > 0) {
        const phLog = saleLogIds.map(() => '?').join(',');
        db.prepare(`UPDATE sync_log SET synced = 1 WHERE id IN (${phLog})`).run(...saleLogIds);
      }
    }

    // ------------------------- PAYMENTS -------------------------
    // Each unsynced sync_log entry for a payment carries an action:
    //   create → return the full row from client_payments
    //   update → return the current row (desktop computes delta from its copy)
    //   delete → return a tombstone { id, __action: 'delete' } — the row is gone
    // We collapse multiple entries per id to the LATEST action so the desktop
    // only has to apply one operation per payment.
    // Same reasoning as sales: `since` watermark is authoritative, no synced
    // filter. Desktop dedupes via client_payments.remote_id (for 'create') and
    // applies update/delete branches idempotently.
    const payLogRows = since
      ? db.prepare(`SELECT entity_id AS payment_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'payment' AND datetime(created_at) > datetime(?)
                    ORDER BY id ASC`).all(since)
      : db.prepare(`SELECT entity_id AS payment_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'payment' AND synced = 0
                    ORDER BY id ASC`).all();

    // Latest action per payment wins
    const latestAction = new Map();
    const logIdsByPaymentId = new Map();
    for (const row of payLogRows) {
      latestAction.set(row.payment_id, row.action);
      (logIdsByPaymentId.get(row.payment_id) || logIdsByPaymentId.set(row.payment_id, []).get(row.payment_id)).push(row.log_id);
    }

    const paymentIds = [...latestAction.keys()];
    let paymentsOut = [];

    if (paymentIds.length > 0) {
      const ph = paymentIds.map(() => '?').join(',');
      const existingRows = db.prepare(`
        SELECT cp.*,
          s.date   AS sale_date,
          s.total  AS sale_total,
          s.status AS sale_status
        FROM client_payments cp
        LEFT JOIN sales s ON cp.sale_id = s.id
        WHERE cp.id IN (${ph})
      `).all(...paymentIds);
      const existingById = new Map(existingRows.map(r => [r.id, r]));

      for (const pid of paymentIds) {
        const action = latestAction.get(pid);
        const row = existingById.get(pid);
        if (action === 'delete') {
          paymentsOut.push({ id: pid, __action: 'delete' });
        } else if (row) {
          paymentsOut.push({ ...row, __action: action });
        }
        // If create/update but row missing (shouldn't happen), skip — log will
        // still be marked synced below, but that's OK because the row is gone
        // and nothing needs to happen on the desktop.
      }

      // Mark all the log entries (including the earlier obsolete ones) as synced
      const allLogIds = [].concat(...logIdsByPaymentId.values());
      const phLog = allLogIds.map(() => '?').join(',');
      db.prepare(`UPDATE sync_log SET synced = 1 WHERE id IN (${phLog})`).run(...allLogIds);
    }

    // ------------------------- CLIENTS -------------------------
    // Mirror the sales/payments pattern. Only mobile-originated clients are
    // logged here (the sync/push ingest does NOT write sync_log — those
    // clients came from desktop, no need to send them back).
    const clientLogRows = since
      ? db.prepare(`SELECT entity_id AS client_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'client' AND datetime(created_at) > datetime(?)
                    ORDER BY id ASC`).all(since)
      : db.prepare(`SELECT entity_id AS client_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'client' AND synced = 0
                    ORDER BY id ASC`).all();

    const latestClientAction = new Map();
    const clientLogIds = [];
    for (const r of clientLogRows) {
      latestClientAction.set(r.client_id, r.action);
      clientLogIds.push(r.log_id);
    }
    const clientIds = [...latestClientAction.keys()];
    let clientsOut = [];
    if (clientIds.length > 0) {
      const ph = clientIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT * FROM clients WHERE id IN (${ph})`).all(...clientIds);
      const byId = new Map(rows.map(r => [r.id, r]));
      for (const cid of clientIds) {
        const row = byId.get(cid);
        if (row) clientsOut.push({ ...row, __action: latestClientAction.get(cid) || 'create' });
      }
      if (clientLogIds.length > 0) {
        const phLog = clientLogIds.map(() => '?').join(',');
        db.prepare(`UPDATE sync_log SET synced = 1 WHERE id IN (${phLog})`).run(...clientLogIds);
      }
    }

    // ------------------------- SUPPLIERS -------------------------
    // Mirror the clients block exactly. Only mobile-originated suppliers are
    // logged here; desktop-origin suppliers arrive via sync/push and do NOT
    // write to sync_log (no need to bounce them back).
    const supplierLogRows = since
      ? db.prepare(`SELECT entity_id AS supplier_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'supplier' AND datetime(created_at) > datetime(?)
                    ORDER BY id ASC`).all(since)
      : db.prepare(`SELECT entity_id AS supplier_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'supplier' AND synced = 0
                    ORDER BY id ASC`).all();

    const latestSupplierAction = new Map();
    const supplierLogIds = [];
    for (const r of supplierLogRows) {
      latestSupplierAction.set(r.supplier_id, r.action);
      supplierLogIds.push(r.log_id);
    }
    const supplierIds = [...latestSupplierAction.keys()];
    let suppliersOut = [];
    if (supplierIds.length > 0) {
      const ph = supplierIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT * FROM suppliers WHERE id IN (${ph})`).all(...supplierIds);
      const byId = new Map(rows.map(r => [r.id, r]));
      for (const sid of supplierIds) {
        const action = latestSupplierAction.get(sid);
        const row = byId.get(sid);
        if (action === 'delete') {
          // Tombstone — desktop reverses its mirror via importRemoteSupplier.
          suppliersOut.push({ id: sid, __action: 'delete' });
        } else if (row) {
          suppliersOut.push({ ...row, __action: action || 'create' });
        }
      }
      if (supplierLogIds.length > 0) {
        const phLog = supplierLogIds.map(() => '?').join(',');
        db.prepare(`UPDATE sync_log SET synced = 1 WHERE id IN (${phLog})`).run(...supplierLogIds);
      }
    }

    // ------------------------- SUPPLIER PAYMENTS -------------------------
    // Same create/update/delete + latest-action-wins pattern as client_payments.
    const spLogRows = since
      ? db.prepare(`SELECT entity_id AS payment_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'supplier_payment' AND datetime(created_at) > datetime(?)
                    ORDER BY id ASC`).all(since)
      : db.prepare(`SELECT entity_id AS payment_id, action, id AS log_id FROM sync_log
                    WHERE entity_type = 'supplier_payment' AND synced = 0
                    ORDER BY id ASC`).all();

    const latestSPAction = new Map();
    const spLogIdsByPaymentId = new Map();
    for (const row of spLogRows) {
      latestSPAction.set(row.payment_id, row.action);
      (spLogIdsByPaymentId.get(row.payment_id)
        || spLogIdsByPaymentId.set(row.payment_id, []).get(row.payment_id)).push(row.log_id);
    }

    const spIds = [...latestSPAction.keys()];
    let supplierPaymentsOut = [];
    if (spIds.length > 0) {
      const ph = spIds.map(() => '?').join(',');
      const existingRows = db.prepare(`
        SELECT * FROM supplier_payments WHERE id IN (${ph})
      `).all(...spIds);
      const existingById = new Map(existingRows.map(r => [r.id, r]));

      for (const pid of spIds) {
        const action = latestSPAction.get(pid);
        const row = existingById.get(pid);
        if (action === 'delete') {
          supplierPaymentsOut.push({ id: pid, __action: 'delete' });
        } else if (row) {
          supplierPaymentsOut.push({ ...row, __action: action });
        }
      }

      const allLogIds = [].concat(...spLogIdsByPaymentId.values());
      const phLog = allLogIds.map(() => '?').join(',');
      db.prepare(`UPDATE sync_log SET synced = 1 WHERE id IN (${phLog})`).run(...allLogIds);
    }

    return {
      sales: salesOut,
      payments: paymentsOut,
      clients: clientsOut,
      suppliers: suppliersOut,
      supplier_payments: supplierPaymentsOut
    };
  });

  try {
    const out = pull();
    return res.json({
      success: true,
      sales: out.sales,
      payments: out.payments,
      clients: out.clients,
      suppliers: out.suppliers,
      supplier_payments: out.supplier_payments
    });
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

    // Marker to detect which sync-code version is deployed. Bump when pull
    // semantics change so we can verify a deploy went live via /api/sync/status.
    const SYNC_PULL_VERSION = 'since-watermark-v2';

    // Also report total (synced + unsynced) sync_log entries so we can see at
    // a glance whether entries exist but are stuck behind synced=1.
    const totalLog = db.prepare(`SELECT COUNT(*) AS c FROM sync_log WHERE entity_type='sale'`).get();

    return res.json({
      success:          true,
      pending_sales:    pendingCount.count,
      total_sale_logs:  totalLog.c,
      last_sale_at:     lastSale ? lastSale.created_at : null,
      server_time:      new Date().toISOString(),
      sync_pull_version: SYNC_PULL_VERSION
    });
  } catch (err) {
    console.error('[sync] GET /status error:', err.message);
    return res.status(500).json({ success: false, error: 'Status check failed' });
  }
});

module.exports = router;
