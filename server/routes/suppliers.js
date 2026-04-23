/**
 * routes/suppliers.js — Supplier directory + payment ledger
 *
 * Mirrors server/routes/clients.js. Every endpoint requires JWT (mounted
 * under authenticate middleware in server/index.js).
 *
 * Supplier balance sign semantics (mirror of clients, inverted in plain
 * language):
 *   balance < 0 → shop owes this supplier X (accounts payable)
 *   balance > 0 → shop has prepayment credit sitting with them
 *   balance = 0 → clear
 *
 * The mobile schema does not include a `purchases` table — purchases are a
 * desktop-only entity. That means:
 *   - unpaid_purchases in GET /:id is always [] on mobile.
 *   - POST /:id/payments never finds purchases to allocate against, so the
 *     FIFO branch is a no-op and the full amount lands as a prepayment row.
 *   - purchase_id is still accepted from the client (the desktop mirrors it
 *     on pull-down) but we do not touch any purchases table here.
 *
 * sync_log domain: 'supplier' for supplier rows, 'supplier_payment' for
 * ledger rows. sync.js currently only replicates client/sale/payment; adding
 * the suppliers entity_types here is a forward-compatible no-op that lets
 * the desktop push/pull wire up later without schema migration.
 */

const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

const MUTATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * GET /api/suppliers
 * Returns all suppliers. purchase_count / total_purchases surfaced as 0 since
 * mobile has no purchases table — keeps the response shape forward-compatible
 * with the desktop response for the same endpoint.
 */
router.get('/', (req, res) => {
  try {
    const suppliers = db.prepare(`
      SELECT
        s.*,
        0 AS purchase_count,
        0 AS total_purchases
      FROM suppliers s
      ORDER BY s.name ASC
    `).all();

    return res.json({ success: true, data: suppliers });
  } catch (err) {
    console.error('[suppliers] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
  }
});

/**
 * GET /api/suppliers/search?q=<query>
 * Mirrors the desktop searchSuppliers query.
 */
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length === 0) {
    return res.status(400).json({ success: false, error: 'Search query is required' });
  }

  try {
    const pattern = `%${q}%`;
    const suppliers = db.prepare(`
      SELECT s.*, 0 AS purchase_count, 0 AS total_purchases
      FROM suppliers s
      WHERE s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ? OR s.address LIKE ?
      ORDER BY s.name ASC
    `).all(pattern, pattern, pattern, pattern);

    return res.json({ success: true, data: suppliers });
  } catch (err) {
    console.error('[suppliers] GET /search error:', err.message);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/suppliers/audit
 *
 * For every supplier, compute the expected balance from the ledger
 *   expected = SUM(supplier_payments.amount)
 * and compare against stored `suppliers.balance`. (Purchases unavailable on
 * mobile, so the clients.js equivalent "minus unpaid invoices" term drops
 * out.) Must be registered BEFORE GET /:id.
 */
router.get('/audit', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        s.id, s.name, s.phone, s.balance AS stored_balance,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) AS sum_payments
      FROM suppliers s
      ORDER BY s.name ASC
    `).all();

    const audited = rows.map(r => {
      const expected = money(r.sum_payments);
      const stored   = money(r.stored_balance);
      const drift    = money(stored - expected);
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        stored_balance: stored,
        expected_balance: expected,
        drift,
        has_drift: Math.abs(drift) > 0.005,
      };
    });

    const drifts = audited.filter(a => a.has_drift);
    return res.json({ success: true, data: { all: audited, drifts, total_drift_count: drifts.length } });
  } catch (err) {
    console.error('[suppliers] GET /audit error:', err.message);
    return res.status(500).json({ success: false, error: 'Audit failed' });
  }
});

/**
 * GET /api/suppliers/payments/:paymentId
 * (No-op placeholder — kept off the surface area per spec; deletion is the
 * only payment-by-id operation required, see DELETE below.)
 */

/**
 * GET /api/suppliers/:id
 * Returns a single supplier. `unpaid_purchases` is always [] on mobile —
 * included as an empty array so the UI can share the shape with desktop.
 */
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid supplier id' });
  }

  try {
    const supplier = db.prepare(`
      SELECT s.*, 0 AS purchase_count, 0 AS total_purchases
      FROM suppliers s
      WHERE s.id = ?
    `).get(id);

    if (!supplier) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    return res.json({ success: true, data: { ...supplier, unpaid_purchases: [] } });
  } catch (err) {
    console.error('[suppliers] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch supplier' });
  }
});

/**
 * POST /api/suppliers
 * Body: { name, phone, address, email, notes, initial_balance? }
 *
 * initial_balance semantics mirror addSupplier in desktop suppliers.cjs:
 *   > 0 → shop has prepayment credit with this supplier
 *   < 0 → shop already owes this supplier (pre-existing AP at day-1)
 *   = 0 → no opening-balance ledger entry
 *
 * Non-zero initial_balance writes a supplier_payments row with
 * method='opening_balance' and sets the balance in the same transaction.
 */
router.post('/', (req, res) => {
  const { name, phone, address, email, notes } = req.body;
  const initialBalance = money(req.body?.initial_balance);

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Supplier name is required' });
  }

  try {
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO suppliers (name, phone, address, email, notes, balance)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(
        name.trim(),
        phone || null,
        address || null,
        email || null,
        notes || null
      );
      const newId = result.lastInsertRowid;
      db.prepare('UPDATE suppliers SET remote_id = ? WHERE id = ?').run(String(newId), newId);
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('supplier', ?, 'create', 0)
      `).run(newId);

      if (initialBalance !== 0) {
        const today = new Date().toISOString().slice(0, 10);
        const payRes = db.prepare(`
          INSERT INTO supplier_payments
            (supplier_id, purchase_id, amount, date, method, notes, batch_id, created_by)
          VALUES (?, NULL, ?, ?, 'opening_balance', ?, ?, ?)
        `).run(
          newId,
          initialBalance,
          today,
          'Opening balance on supplier creation',
          `sup-opening-${newId}`,
          req.user?.userId || null
        );
        db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?')
          .run(initialBalance, newId);
        db.prepare(`
          INSERT INTO sync_log (entity_type, entity_id, action, synced)
          VALUES ('supplier_payment', ?, 'create', 0)
        `).run(payRes.lastInsertRowid);
      }
      return newId;
    });
    const newId = txn();

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(newId);
    return res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    console.error('[suppliers] POST / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create supplier' });
  }
});

/**
 * PATCH /api/suppliers/:id
 * Updates basic fields — name, phone, address, email, notes. Balance is
 * intentionally NOT updatable via this route; balance is derived from the
 * supplier_payments ledger. Use POST /:id/payments to move the balance.
 */
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid supplier id' });
  }

  try {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const name    = req.body.name    !== undefined ? (req.body.name || '').trim() : existing.name;
    const phone   = req.body.phone   !== undefined ? (req.body.phone   || null) : existing.phone;
    const address = req.body.address !== undefined ? (req.body.address || null) : existing.address;
    const email   = req.body.email   !== undefined ? (req.body.email   || null) : existing.email;
    const notes   = req.body.notes   !== undefined ? (req.body.notes   || null) : existing.notes;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    db.prepare(`
      UPDATE suppliers SET
        name = ?, phone = ?, address = ?, email = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, phone, address, email, notes, id);

    db.prepare(`
      INSERT INTO sync_log (entity_type, entity_id, action, synced)
      VALUES ('supplier', ?, 'update', 0)
    `).run(id);

    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[suppliers] PATCH /:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update supplier' });
  }
});

/**
 * DELETE /api/suppliers/:id
 * Admin-only. Cascade-deletes supplier_payments via FK ON DELETE CASCADE.
 */
router.delete('/:id', (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only admins can delete suppliers' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid supplier id' });
  }

  try {
    const existing = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Supplier not found' });

    db.transaction(() => {
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('supplier', ?, 'delete', 0)
      `).run(id);
    })();

    return res.json({ success: true });
  } catch (err) {
    console.error('[suppliers] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete supplier' });
  }
});

/**
 * GET /api/suppliers/:id/payments
 * Returns the supplier_payments ledger rows for one supplier, newest first.
 * Joins the created_by user so the UI can attribute entries.
 */
router.get('/:id/payments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid supplier id' });
  }

  try {
    const payments = db.prepare(`
      SELECT sp.id, sp.supplier_id, sp.purchase_id, sp.amount, sp.date,
             sp.method, sp.notes, sp.batch_id, sp.created_by, sp.created_at,
             u.name AS created_by_name
      FROM supplier_payments sp
      LEFT JOIN users u ON sp.created_by = u.id
      WHERE sp.supplier_id = ?
      ORDER BY sp.date DESC, sp.id DESC
    `).all(id);

    return res.json({ success: true, data: payments });
  } catch (err) {
    console.error('[suppliers] GET /:id/payments error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load payments' });
  }
});

/**
 * POST /api/suppliers/:id/payments
 * Body: { amount, date?, method?, notes?, purchase_id? }
 *
 * If purchase_id is set, the payment is tagged to that purchase for the
 * desktop pull to reconcile on its side (mobile has no purchases table to
 * update). Otherwise it's a general payment / prepayment row that moves
 * the supplier balance.
 *
 * Balance math mirrors clients: shop pays supplier → supplier balance +=
 * amount (moves toward zero or positive credit). The sign convention makes
 * the audit (balance = SUM(payments)) work identically to clients.
 */
router.post('/:id/payments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const amt = money(req.body?.amount);
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  const method = req.body?.method || 'cash';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null;
  const purchaseId = req.body?.purchase_id != null ? parseInt(req.body.purchase_id, 10) : null;
  const createdBy = req.user?.userId || null;

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid supplier id' });
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be positive' });
  }

  try {
    const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const batchId = purchaseId
      ? `sup-pay-${purchaseId}-${Date.now()}`
      : `sup-versement-${Date.now()}`;

    const tx = db.transaction(() => {
      const payRes = db.prepare(`
        INSERT INTO supplier_payments
          (supplier_id, purchase_id, amount, date, method, notes, batch_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, purchaseId, amt, date, method, notes, batchId, createdBy);
      db.prepare('UPDATE suppliers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(amt, id);
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('supplier_payment', ?, 'create', 0)
      `).run(payRes.lastInsertRowid);
      return payRes.lastInsertRowid;
    });

    const paymentId = tx();
    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    return res.status(201).json({
      success: true,
      data: { supplier: updated, payment_id: paymentId, batch_id: batchId },
    });
  } catch (err) {
    console.error('[suppliers] POST /:id/payments error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to record payment' });
  }
});

/**
 * DELETE /api/suppliers/payments/:paymentId
 * Admin-only. Reverses the ledger row's effect on the supplier balance.
 * Sales-role mutate window handled the same way payments.js does, but the
 * spec calls for admin-only here to match the sensitivity of supplier
 * balance adjustments.
 */
router.delete('/payments/:paymentId', (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only admins can delete supplier payments' });
  }

  const paymentId = parseInt(req.params.paymentId, 10);
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid payment id' });
  }

  try {
    const existing = db.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(paymentId);
    if (!existing) return res.status(404).json({ success: false, error: 'Payment not found' });

    db.transaction(() => {
      db.prepare('UPDATE suppliers SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.amount, existing.supplier_id);
      db.prepare('DELETE FROM supplier_payments WHERE id = ?').run(paymentId);
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('supplier_payment', ?, 'delete', 0)
      `).run(paymentId);
    })();

    return res.json({ success: true });
  } catch (err) {
    console.error('[suppliers] DELETE /payments/:paymentId error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete payment' });
  }
});

module.exports = router;
