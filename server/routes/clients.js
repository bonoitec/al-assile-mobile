const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

/**
 * GET /api/clients
 * Returns all clients with aggregated balance information sourced from both
 * the stored balance field and any outstanding sales on the mobile side.
 * This mirrors the desktop getAllClients query from clients.cjs.
 */
router.get('/', (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM sales WHERE client_id = c.id) AS sale_count,
        (SELECT COALESCE(SUM(total), 0)
           FROM sales WHERE client_id = c.id) AS total_purchases,
        (SELECT COALESCE(SUM(total - paid_amount), 0)
           FROM sales
           WHERE client_id = c.id AND status != 'paid') AS outstanding_debt
      FROM clients c
      ORDER BY c.name ASC
    `).all();

    return res.json({ success: true, data: clients });
  } catch (err) {
    console.error('[clients] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch clients' });
  }
});

/**
 * GET /api/clients/search?q=<query>
 * Searches by name or phone.  Mirrors the desktop searchClients query.
 * Returns a 400 if the query string is missing or too short.
 */
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length === 0) {
    return res.status(400).json({ success: false, error: 'Search query is required' });
  }

  try {
    const pattern = `%${q}%`;
    const clients = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM sales WHERE client_id = c.id) AS sale_count,
        (SELECT COALESCE(SUM(total - paid_amount), 0)
           FROM sales
           WHERE client_id = c.id AND status != 'paid') AS outstanding_debt
      FROM clients c
      WHERE c.name LIKE ? OR c.phone LIKE ?
      ORDER BY c.name ASC
    `).all(pattern, pattern);

    return res.json({ success: true, data: clients });
  } catch (err) {
    console.error('[clients] GET /search error:', err.message);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/clients/audit
 *
 * For every client, compute the "expected balance" from transaction history
 *   expected = SUM(client_payments.amount) − SUM(unpaid sale remainders)
 * and compare against the stored `clients.balance`. Returns drift rows so
 * the UI can flag discrepancies and offer one-click repair.
 *
 * Must be registered BEFORE GET /:id so Express doesn't match 'audit' as
 * a client id.
 */
router.get('/audit', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        c.id, c.name, c.phone, c.balance AS stored_balance,
        COALESCE((SELECT SUM(amount) FROM client_payments WHERE client_id = c.id), 0) AS sum_payments,
        COALESCE((SELECT SUM(total - paid_amount) FROM sales
                   WHERE client_id = c.id AND status NOT IN ('paid','cancelled')), 0) AS sum_outstanding
      FROM clients c
      ORDER BY c.name ASC
    `).all();

    const audited = rows.map(r => {
      const expected = Math.round((r.sum_payments - r.sum_outstanding) * 100) / 100;
      const stored   = Math.round(r.stored_balance * 100) / 100;
      const drift    = Math.round((stored - expected) * 100) / 100;
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
    console.error('[clients] GET /audit error:', err.message);
    return res.status(500).json({ success: false, error: 'Audit failed' });
  }
});

/**
 * GET /api/clients/:id
 * Returns a single client with aggregated sale statistics.
 */
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid client id' });
  }

  try {
    const client = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM sales WHERE client_id = c.id) AS sale_count,
        (SELECT COALESCE(SUM(total), 0)
           FROM sales WHERE client_id = c.id) AS total_purchases,
        (SELECT COALESCE(SUM(total - paid_amount), 0)
           FROM sales
           WHERE client_id = c.id AND status != 'paid') AS outstanding_debt
      FROM clients c
      WHERE c.id = ?
    `).get(id);

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Include unpaid sales so the mobile Clients detail screen can show them
    // without a second round-trip.
    const unpaid_sales = db.prepare(`
      SELECT id, date, total, paid_amount, status, notes,
             (total - paid_amount) AS remaining
      FROM sales
      WHERE client_id = ?
        AND status NOT IN ('paid', 'cancelled', 'return')
      ORDER BY date ASC, id ASC
    `).all(id);

    return res.json({ success: true, data: { ...client, unpaid_sales } });
  } catch (err) {
    console.error('[clients] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch client' });
  }
});

/**
 * POST /api/clients
 * Create a new client. Body: { name, phone, address, email, notes, initial_balance? }
 *
 * initial_balance:
 *   > 0 → client already has credit with the shop (prepayment / top-up)
 *   < 0 → client already owes the shop (pre-existing debt carried into the
 *          system on day-1 onboarding)
 *   = 0 → default, no opening entry created
 *
 * A non-zero initial_balance writes a matching `client_payments` row with
 * method='opening_balance' so the audit report reconciles correctly and the
 * desktop can reproduce the balance from transaction history.
 */
router.post('/', (req, res) => {
  const { name, phone, address, email, notes } = req.body;
  // Coerce the optional opening balance. Any non-number becomes 0.
  const initialBalance = Math.round((Number(req.body?.initial_balance) || 0) * 100) / 100;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Client name is required' });
  }

  try {
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO clients (name, phone, address, email, notes, balance)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(
        name.trim(),
        phone || null,
        address || null,
        email || null,
        notes || null
      );
      const newId = result.lastInsertRowid;
      // Stamp remote_id so the sync replay is idempotent and future desktop
      // pushes don't clobber this mobile-created row.
      db.prepare('UPDATE clients SET remote_id = ? WHERE id = ?').run(String(newId), newId);
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('client', ?, 'create', 0)
      `).run(newId);

      // Opening-balance ledger entry (if any). Write it as a client_payments
      // row with a distinctive method so reports can surface it, and log the
      // payment so desktop mirrors it. Updates clients.balance in one txn.
      if (initialBalance !== 0) {
        const today = new Date().toISOString().slice(0, 10);
        const payRes = db.prepare(`
          INSERT INTO client_payments
            (client_id, sale_id, amount, date, method, notes, batch_id, created_by)
          VALUES (?, NULL, ?, ?, 'opening_balance', ?, ?, ?)
        `).run(
          newId,
          initialBalance,
          today,
          'Opening balance on client creation',
          `opening-${newId}`,
          req.user?.userId || null
        );
        db.prepare('UPDATE clients SET balance = balance + ? WHERE id = ?')
          .run(initialBalance, newId);
        db.prepare(`
          INSERT INTO sync_log (entity_type, entity_id, action, synced)
          VALUES ('payment', ?, 'create', 0)
        `).run(payRes.lastInsertRowid);
      }
      return newId;
    });
    const newId = txn();

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(newId);
    return res.status(201).json({ success: true, data: client });
  } catch (err) {
    console.error('[clients] POST / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create client' });
  }
});

/**
 * PATCH /api/clients/:id/contact-note
 * Body: { note?: string }
 *
 * Stamps last_contact_at = now and saves an optional free-form note. Used by
 * the mobile WhatsApp-reminder button so the shopkeeper can tell at a glance
 * whether they already nudged this client today. Sync log lets the desktop
 * mirror it; the full-clients push carries the updated fields.
 */
router.patch('/:id/contact-note', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid client id' });
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : null;

  try {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    db.prepare(`
      UPDATE clients SET
        last_contact_note = ?,
        last_contact_at   = CURRENT_TIMESTAMP,
        updated_at        = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(note || null, id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[clients] PATCH /:id/contact-note error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to record contact' });
  }
});

/**
 * POST /api/clients/:id/funding
 * Body: { amount, notes? }
 *
 * "Funding / top-up" — the shopkeeper deposits credit into a client's account
 * BEFORE any sale. Increases the balance (more positive = more credit). This
 * is distinct from a versement (which pays down existing sale debt) because
 * funding is not allocated to any sale; it just sits as credit until used.
 *
 * Writes a client_payments row with method='funding' and logs to sync_log.
 */
router.post('/:id/funding', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const amount = Math.round((Number(req.body?.amount) || 0) * 100) / 100;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : null;

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid client id' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be positive' });
  }

  try {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const today = new Date().toISOString().slice(0, 10);
    const txn = db.transaction(() => {
      const payRes = db.prepare(`
        INSERT INTO client_payments
          (client_id, sale_id, amount, date, method, notes, batch_id, created_by)
        VALUES (?, NULL, ?, ?, 'funding', ?, ?, ?)
      `).run(id, amount, today, notes, `funding-${Date.now()}`, req.user?.userId || null);
      db.prepare('UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(amount, id);
      db.prepare(`INSERT INTO sync_log (entity_type, entity_id, action, synced) VALUES ('payment', ?, 'create', 0)`)
        .run(payRes.lastInsertRowid);
      return payRes.lastInsertRowid;
    });
    const paymentId = txn();

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    return res.status(201).json({ success: true, data: { client: updated, payment_id: paymentId } });
  } catch (err) {
    console.error('[clients] POST /:id/funding error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to record funding' });
  }
});

/**
 * GET /api/clients/audit
 *
 * For every client, compute the "expected balance" from transaction history
 *   expected = SUM(client_payments.amount) − SUM(unpaid sale remainders)
 * and compare against the stored `clients.balance`. Returns drift rows so
 * the UI can flag discrepancies and offer one-click repair.
 *
 * "Unpaid" = sales.status != 'paid' AND != 'cancelled'; the remainder is
 *   (total − paid_amount).
 *
 * This is the single-source-of-truth reconciliation the double-counting bug
 * would have surfaced immediately.
 */

/**
 * POST /api/clients/:id/repair-balance
 *
 * Recomputes the client's balance from transaction history and sets
 * `clients.balance` accordingly. Used by the audit UI's "Fix" button.
 * Writes a sync_log entry so the desktop sees the correction.
 */
router.post('/:id/repair-balance', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid client id' });
  }

  try {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const sumPayments = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS s FROM client_payments WHERE client_id = ?'
    ).get(id).s;
    const sumOutstanding = db.prepare(
      `SELECT COALESCE(SUM(total - paid_amount), 0) AS s FROM sales
        WHERE client_id = ? AND status NOT IN ('paid','cancelled')`
    ).get(id).s;
    const expected = Math.round((sumPayments - sumOutstanding) * 100) / 100;

    db.transaction(() => {
      db.prepare('UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(expected, id);
      // Re-emit the client 'create' (acts as an upsert signal) so desktop's
      // next pull re-imports and the balance correction propagates. Same
      // pattern as update events on payments.
      db.prepare(`INSERT INTO sync_log (entity_type, entity_id, action, synced) VALUES ('client', ?, 'update', 0)`)
        .run(id);
    })();

    return res.json({ success: true, data: { id, balance: expected } });
  } catch (err) {
    console.error('[clients] POST /:id/repair-balance error:', err.message);
    return res.status(500).json({ success: false, error: 'Repair failed' });
  }
});

module.exports = router;
