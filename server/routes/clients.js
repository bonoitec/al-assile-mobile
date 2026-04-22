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
 * Create a new client. Body: { name, phone, address, email, notes }
 */
router.post('/', (req, res) => {
  const { name, phone, address, email, notes } = req.body;

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
      // Stamp remote_id = our own id so the desktop pull can dedupe on it
      // (and ignore it if desktop's own push later sends this same row back).
      db.prepare('UPDATE clients SET remote_id = ? WHERE id = ?').run(String(newId), newId);
      // Log the new client for the next desktop pull. Same pattern as sales
      // and payments — the pull returns rows by sync_log.created_at watermark.
      db.prepare(`
        INSERT INTO sync_log (entity_type, entity_id, action, synced)
        VALUES ('client', ?, 'create', 0)
      `).run(newId);
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

module.exports = router;
