/**
 * routes/payments.js — Client payment ledger (versement global + history + edit/delete)
 *
 * Mirrors the desktop clients.cjs ledger methods. Every endpoint requires JWT.
 *
 * Fraud mitigation for the mobile edit/delete paths:
 *   - 'sales' role can only mutate payments they created themselves AND only
 *     within the MUTATE_WINDOW_MS of creation.
 *   - 'admin' and 'manager' bypass both constraints.
 *   - 'method = adjustment' rows are admin-only.
 */

const express = require('express');
const db      = require('../database/connection');

const router = express.Router();

// 24-hour correction window for the 'sales' role. After this, typos must be
// fixed by an admin — matches the operator-fraud-window pattern used by most
// POS systems.
const MUTATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// GET /api/payments?client_id=XX — payment history for one client
//
// Returns the client_payments ledger rows (explicit versements + any edits)
// PLUS synthesized read-only rows for each sale's initial cash portion so the
// mobile UI shows the complete money-movement timeline without divergence.
// Synthesized rows get a string id like 'sale-42' so the UI knows they are
// read-only (the edit/delete buttons check for numeric id).
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const clientId = parseInt(req.query.client_id, 10);
  if (!Number.isInteger(clientId) || clientId < 1) {
    return res.status(400).json({ success: false, error: 'client_id query param required' });
  }
  try {
    const ledger = db.prepare(`
      SELECT cp.id AS id, cp.client_id, cp.sale_id, cp.amount, cp.date,
        cp.method, cp.notes, cp.batch_id, cp.created_by, cp.created_at,
        s.date AS sale_date, s.total AS sale_total, s.status AS sale_status,
        u.name AS created_by_name,
        0 AS synthetic
      FROM client_payments cp
      LEFT JOIN sales s ON cp.sale_id = s.id
      LEFT JOIN users u ON cp.created_by = u.id
      WHERE cp.client_id = ?
    `).all(clientId);

    const saleCashRows = db.prepare(`
      SELECT s.id AS sale_id, s.date, s.total, s.paid_amount AS amount,
        s.payment_method AS method, s.status AS sale_status, s.created_at,
        u.name AS created_by_name
      FROM sales s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.client_id = ?
        AND s.status != 'return'
        AND s.paid_amount > 0
    `).all(clientId).map(r => ({
      id:              `sale-${r.sale_id}`,
      client_id:       clientId,
      sale_id:         r.sale_id,
      amount:          r.amount,
      date:            r.date,
      method:          r.method || 'cash',
      notes:           null,
      batch_id:        null,
      created_by:      null,
      created_at:      r.created_at,
      sale_date:       r.date,
      sale_total:      r.total,
      sale_status:     r.sale_status,
      created_by_name: r.created_by_name,
      synthetic:       1,   // UI uses this to disable edit/delete
    }));

    // Merge + sort newest first
    const combined = [...ledger, ...saleCashRows].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id || 0) > (a.id || 0) ? 1 : -1;
    });

    return res.json({ success: true, data: combined });
  } catch (err) {
    console.error('[payments] GET / error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load payment history' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments — versement global (FIFO allocation)
// Body: { client_id, amount, date?, method?, notes? }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const clientId = parseInt(req.body.client_id, 10);
  const amt      = money(req.body.amount);
  const date     = req.body.date   || new Date().toISOString().split('T')[0];
  const method   = req.body.method || 'cash';
  const notes    = req.body.notes  || null;
  const createdBy = req.user.userId || null;

  if (!Number.isInteger(clientId) || clientId < 1) {
    return res.status(400).json({ success: false, error: 'client_id is required' });
  }
  if (amt <= 0) {
    return res.status(400).json({ success: false, error: 'amount must be positive' });
  }
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(clientId)) {
    return res.status(404).json({ success: false, error: 'Client not found' });
  }

  const batchId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tx = db.transaction(() => {
    const unpaid = db.prepare(`
      SELECT id, total, paid_amount FROM sales
      WHERE client_id = ?
        AND status NOT IN ('paid', 'cancelled', 'return')
        AND (total - paid_amount) > 0
      ORDER BY date ASC, id ASC
    `).all(clientId);

    const insertPayment = db.prepare(`
      INSERT INTO client_payments (client_id, sale_id, amount, date, method, notes, batch_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateSale    = db.prepare(`UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?`);
    const updateBalance = db.prepare(`UPDATE clients SET balance = balance + ? WHERE id = ?`);
    const logSync       = db.prepare(`INSERT INTO sync_log (entity_type, entity_id, action) VALUES ('payment', ?, 'create')`);

    let remaining = amt;
    const allocations = [];

    for (const sale of unpaid) {
      if (remaining <= 0) break;
      const outstanding = money(sale.total - sale.paid_amount);
      if (outstanding <= 0) continue;
      const allocate = money(Math.min(remaining, outstanding));

      const newPaid = money(sale.paid_amount + allocate);
      const newStatus = newPaid >= sale.total ? 'paid' : 'partial';
      updateSale.run(newPaid, newStatus, sale.id);

      const res1 = insertPayment.run(clientId, sale.id, allocate, date, method, notes, batchId, createdBy);
      updateBalance.run(allocate, clientId);
      logSync.run(res1.lastInsertRowid);
      allocations.push({ payment_id: res1.lastInsertRowid, sale_id: sale.id, amount: allocate });
      remaining = money(remaining - allocate);
    }

    let creditCarry = 0;
    if (remaining > 0) {
      const res2 = insertPayment.run(clientId, null, remaining, date, 'credit_carry', notes, batchId, createdBy);
      updateBalance.run(remaining, clientId);
      logSync.run(res2.lastInsertRowid);
      allocations.push({ payment_id: res2.lastInsertRowid, sale_id: null, amount: remaining });
      creditCarry = remaining;
    }

    return {
      batchId,
      totalApplied: money(amt - creditCarry),
      creditCarry,
      allocations,
    };
  });

  try {
    const result = tx();
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[payments] POST / error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/payments/:id — edit a payment
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid payment id' });
  }

  const existing = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Payment not found' });
  }

  // Permission check
  const { role, userId } = req.user;
  if (existing.method === 'adjustment' && role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only admins can edit balance adjustments' });
  }
  if (role === 'sales') {
    if (existing.created_by !== userId) {
      return res.status(403).json({ success: false, error: 'You can only edit your own payments' });
    }
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age > MUTATE_WINDOW_MS) {
      return res.status(403).json({ success: false, error: 'Correction window expired (24h). Ask an admin.' });
    }
  }

  const newAmount = req.body.amount != null ? money(req.body.amount) : existing.amount;
  if (newAmount === 0) {
    return res.status(400).json({ success: false, error: 'Amount cannot be zero — delete the entry instead' });
  }
  if (newAmount < 0 && existing.method !== 'adjustment') {
    return res.status(400).json({ success: false, error: 'Only adjustments can have negative amounts' });
  }

  const delta = money(newAmount - existing.amount);

  const tx = db.transaction(() => {
    if (existing.sale_id) {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(existing.sale_id);
      if (sale) {
        const newPaid = money(sale.paid_amount + delta);
        if (newPaid < 0) throw new Error('Edit would make sale paid_amount negative');
        if (newPaid > sale.total) throw new Error('Edit would overpay the sale');
        const newStatus = newPaid >= sale.total ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
        db.prepare('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?').run(newPaid, newStatus, sale.id);
      }
    }
    db.prepare('UPDATE clients SET balance = balance + ? WHERE id = ?').run(delta, existing.client_id);
    db.prepare(`
      UPDATE client_payments
      SET amount = ?, date = ?, notes = ?
      WHERE id = ?
    `).run(
      newAmount,
      req.body.date  !== undefined ? req.body.date  : existing.date,
      req.body.notes !== undefined ? req.body.notes : existing.notes,
      id
    );
    db.prepare(`INSERT INTO sync_log (entity_type, entity_id, action) VALUES ('payment', ?, 'update')`).run(id);
  });

  try {
    tx();
    return res.json({ success: true, delta });
  } catch (err) {
    console.error('[payments] PATCH /:id error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/payments/:id — reverse and remove
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, error: 'Invalid payment id' });
  }

  const existing = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Payment not found' });
  }

  const { role, userId } = req.user;
  if (existing.method === 'adjustment' && role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only admins can delete balance adjustments' });
  }
  if (role === 'sales') {
    if (existing.created_by !== userId) {
      return res.status(403).json({ success: false, error: 'You can only delete your own payments' });
    }
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age > MUTATE_WINDOW_MS) {
      return res.status(403).json({ success: false, error: 'Correction window expired (24h). Ask an admin.' });
    }
  }

  const tx = db.transaction(() => {
    if (existing.sale_id) {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(existing.sale_id);
      if (sale) {
        const newPaid = money(sale.paid_amount - existing.amount);
        if (newPaid < 0) throw new Error('Reversal would make sale paid_amount negative');
        const newStatus = newPaid >= sale.total ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
        db.prepare('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?').run(newPaid, newStatus, sale.id);
      }
    }
    db.prepare('UPDATE clients SET balance = balance - ? WHERE id = ?').run(existing.amount, existing.client_id);
    db.prepare('DELETE FROM client_payments WHERE id = ?').run(id);
    db.prepare(`INSERT INTO sync_log (entity_type, entity_id, action) VALUES ('payment', ?, 'delete')`).run(id);
  });

  try {
    tx();
    return res.json({ success: true });
  } catch (err) {
    console.error('[payments] DELETE /:id error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
