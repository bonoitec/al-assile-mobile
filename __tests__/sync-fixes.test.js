/**
 * Integration tests for the sync fixes shipped in commits f29c706, 927e0b6,
 * and cdfdebf. Runs against an in-memory SQLite using the real route modules.
 * No mocks — touches the same SQL the production server runs.
 *
 *   node __tests__/sync-fixes.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const express = require('express');
const http = require('node:http');

process.env.JWT_SECRET   = 'test-secret';
process.env.SYNC_KEY     = 'test-sync-key';
process.env.NODE_ENV     = 'test';

// Inject an in-memory better-sqlite3 connection BEFORE any route module is
// required, so the routers' `require('../database/connection')` returns our
// test instance instead of opening the on-disk dev DB.
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
const connectionPath = path.resolve(__dirname, '../server/database/connection.js');
require.cache[connectionPath] = {
  id: connectionPath,
  filename: connectionPath,
  loaded: true,
  exports: db,
};

// Now the schema initializer (which exports initDatabase(db)) builds tables.
const { initDatabase } = require('../server/database/schema.js');
initDatabase(db);

// Mount the same routers production uses.
const salesRouter      = require('../server/routes/sales.js');
const clientsRouter    = require('../server/routes/clients.js');
const suppliersRouter  = require('../server/routes/suppliers.js');

function buildApp({ role = 'admin', userId = 1 } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { role, userId }; next(); });
  app.use('/api/clients',   clientsRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/sales',     salesRouter);
  return app;
}

function listen(app) {
  return new Promise(rs => {
    const srv = app.listen(0, () => rs(srv));
  });
}

function call(srv, method, path, body) {
  return new Promise((resolve, reject) => {
    const port = srv.address().port;
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      port, path, method,
      headers: data
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
        : {},
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
        } catch (err) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Seed a single user, client, walk-in placeholder, product. Reset on each test.
function seed() {
  db.prepare('DELETE FROM sync_log').run();
  db.prepare('DELETE FROM client_payments').run();
  db.prepare('DELETE FROM sale_items').run();
  db.prepare('DELETE FROM sales').run();
  db.prepare('DELETE FROM supplier_payments').run();
  db.prepare('DELETE FROM suppliers').run();
  db.prepare('DELETE FROM clients').run();
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM users').run();

  db.prepare(`INSERT INTO users (id, name, username, password_hash, role) VALUES (1, 'Test Admin', 'admin', 'x', 'admin')`).run();
  db.prepare(`INSERT INTO clients (id, name, phone, balance) VALUES (1, 'Alice', '0555', 0)`).run();
  db.prepare(`INSERT INTO clients (id, name, phone, balance) VALUES (2, 'Bob', '0666', 0)`).run();
  db.prepare(`INSERT INTO suppliers (id, name, phone, balance) VALUES (1, 'Acme', '0777', 0)`).run();
  db.prepare(`INSERT INTO products (id, name, selling_price, unit, quantity) VALUES (1, 'Widget', 100, 'pcs', 50)`).run();
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ============================================================================
// TEST 1 — Mobile POST /:id/payment inserts ledger + leaves sale.paid_amount alone
// ============================================================================
test('POST /:id/payment: inserts client_payments, does NOT mutate sales.paid_amount', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    // Create sale: client=1, total=1000, paid=300 at creation (debt=700)
    const create = await call(srv, 'POST', '/api/sales', {
      client_id: 1,
      items: [{ product_id: 1, quantity: 10, unit_price: 100 }],
      paid_amount: 300,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    assert.equal(create.status, 201, 'sale create');
    const saleId = create.body.data.id;

    // Sanity: sale.paid_amount should be 300 in DB
    const before = db.prepare('SELECT paid_amount, status FROM sales WHERE id = ?').get(saleId);
    assert.equal(before.paid_amount, 300, 'before pay: at-creation paid_amount');

    // Record post-creation payment of 200
    const pay = await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 200 });
    assert.equal(pay.status, 200, 'payment ok');

    // After fix: sales.paid_amount should STILL be 300 on disk
    const after = db.prepare('SELECT paid_amount, status FROM sales WHERE id = ?').get(saleId);
    assert.equal(after.paid_amount, 300, 'after pay: sale.paid_amount unchanged on disk');

    // client_payments row should exist with amount=200, sale_id=saleId
    const cp = db.prepare('SELECT * FROM client_payments WHERE sale_id = ?').get(saleId);
    assert.ok(cp, 'ledger row created');
    assert.equal(cp.amount, 200, 'ledger amount');
    assert.equal(cp.client_id, 1, 'ledger client_id');
    assert.equal(cp.sale_id, saleId, 'ledger sale_id');

    // Response paid_amount should be the COMPUTED total (300+200=500)
    assert.equal(pay.body.data.paid_amount, 500, 'response shows running total');
    assert.equal(pay.body.data.paid_at_creation, 300, 'response exposes at-creation');
    assert.equal(pay.body.data.status, 'partial', 'response status');

    // sync_log should have ('payment', payment_id, 'create')
    const log = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'payment'`).get();
    assert.ok(log, 'sync_log entry exists');
    assert.equal(log.entity_id, cp.id, 'log entity_id is payment_id, NOT sale_id');
    assert.equal(log.action, 'create', 'log action');

    // Client balance: -700 (initial) + 200 (payment) = -500
    const cl = db.prepare('SELECT balance FROM clients WHERE id = 1').get();
    assert.equal(cl.balance, -500, 'client balance reflects net debt');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 2 — Walk-in (no client) post-creation payment is rejected with 400
// ============================================================================
test('POST /:id/payment on walk-in sale returns 400, does not corrupt DB', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    const create = await call(srv, 'POST', '/api/sales', {
      client_id: null,
      items: [{ product_id: 1, quantity: 1, unit_price: 100 }],
      paid_amount: 100,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    assert.equal(create.status, 201, 'walk-in sale create');
    const saleId = create.body.data.id;

    const pay = await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 50 });
    assert.equal(pay.status, 400, 'walk-in payment rejected');
    assert.match(pay.body.error, /Walk-in/i, 'error mentions walk-in');

    // No client_payments rows for this sale
    const cp = db.prepare('SELECT COUNT(*) AS c FROM client_payments WHERE sale_id = ?').get(saleId);
    assert.equal(cp.c, 0, 'no ledger row inserted');
    // No sync_log entry was leaked from a partial transaction
    const log = db.prepare(`SELECT COUNT(*) AS c FROM sync_log WHERE entity_type = 'payment'`).get();
    assert.equal(log.c, 0, 'no sync_log leak');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 3 — Already-paid sale rejects further payment with 409
// ============================================================================
test('POST /:id/payment on fully-paid sale returns 409', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    const create = await call(srv, 'POST', '/api/sales', {
      client_id: 1,
      items: [{ product_id: 1, quantity: 5, unit_price: 100 }],
      paid_amount: 500,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    assert.equal(create.status, 201);
    const saleId = create.body.data.id;

    // First post-payment fails: already paid in full
    const pay = await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 100 });
    assert.equal(pay.status, 409, 'overpay rejected');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 4 — GET /api/sales/:id returns paid_total + computed status
// ============================================================================
test('GET /:id returns running paid_total + derived status', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    const create = await call(srv, 'POST', '/api/sales', {
      client_id: 1,
      items: [{ product_id: 1, quantity: 10, unit_price: 100 }],
      paid_amount: 300,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    const saleId = create.body.data.id;
    await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 200 });
    await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 500 });

    const get = await call(srv, 'GET', `/api/sales/${saleId}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.data.paid_amount, 1000, 'paid_total = 300 + 200 + 500');
    assert.equal(get.body.data.status, 'paid', 'status fully paid');
    assert.equal(get.body.data.paid_at_creation, 300, 'at-creation preserved');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 5 — DELETE /api/sales/:id reverses BOTH at-creation and post-creation balance
// ============================================================================
test('DELETE /:id reverses cumulative balance change correctly', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    // Sale: total=1000, paid=300 at creation → balance -= 700
    const create = await call(srv, 'POST', '/api/sales', {
      client_id: 1,
      items: [{ product_id: 1, quantity: 10, unit_price: 100 }],
      paid_amount: 300,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    const saleId = create.body.data.id;

    // Post-creation payment 200 → balance += 200
    await call(srv, 'POST', `/api/sales/${saleId}/payment`, { amount: 200 });

    // Pre-delete balance: -500
    const before = db.prepare('SELECT balance FROM clients WHERE id = 1').get().balance;
    assert.equal(before, -500, 'pre-delete balance');

    const del = await call(srv, 'DELETE', `/api/sales/${saleId}`);
    assert.equal(del.status, 200, 'delete ok');

    // Balance must return to 0
    const after = db.prepare('SELECT balance FROM clients WHERE id = 1').get().balance;
    assert.equal(after, 0, 'balance fully reversed (both at-creation and post-creation)');

    // Stock restored
    const prod = db.prepare('SELECT quantity FROM products WHERE id = 1').get();
    assert.equal(prod.quantity, 50, 'stock restored');

    // Per-payment delete tombstones logged + sale tombstone logged
    const sLog = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'sale' AND action = 'delete'`).all();
    assert.equal(sLog.length, 1, 'sale tombstone logged');
    const pLog = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'payment' AND action = 'delete'`).all();
    assert.equal(pLog.length, 1, 'payment tombstone logged');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 6 — POST /api/clients/:id/adjust inserts adjustment row + logs payment
// ============================================================================
test('POST /:id/adjust admin-only credit/debit with sync_log', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    // Credit: write off 200
    const credit = await call(srv, 'POST', '/api/clients/1/adjust', {
      amount: 200,
      reason: 'Goodwill credit',
    });
    assert.equal(credit.status, 201);

    let cl = db.prepare('SELECT balance FROM clients WHERE id = 1').get();
    assert.equal(cl.balance, 200, 'positive adjustment lifts balance');

    // Debit: charge 50
    const debit = await call(srv, 'POST', '/api/clients/1/adjust', {
      amount: -50,
      reason: 'Manual correction',
    });
    assert.equal(debit.status, 201);
    cl = db.prepare('SELECT balance FROM clients WHERE id = 1').get();
    assert.equal(cl.balance, 150, 'negative adjustment lowers balance');

    // Both produced client_payments rows with method='adjustment'
    const rows = db.prepare(`SELECT * FROM client_payments WHERE method = 'adjustment'`).all();
    assert.equal(rows.length, 2, '2 adjustment rows');

    // sync_log has 2 payment.create entries
    const logs = db.prepare(`SELECT COUNT(*) AS c FROM sync_log WHERE entity_type = 'payment' AND action = 'create'`).get();
    assert.equal(logs.c, 2, '2 sync_log entries for adjustments');

    // Reason is required
    const noReason = await call(srv, 'POST', '/api/clients/1/adjust', { amount: 100 });
    assert.equal(noReason.status, 400, 'reason required');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 7 — DELETE /api/clients/:id blocks when sales exist + cascades when not
// ============================================================================
test('DELETE /:id blocks if sales exist; otherwise succeeds + logs delete', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    // Bob (id=2) has no sales — delete should succeed
    const ok = await call(srv, 'DELETE', '/api/clients/2');
    assert.equal(ok.status, 200, 'delete ok');
    const exists = db.prepare('SELECT id FROM clients WHERE id = 2').get();
    assert.equal(exists, undefined, 'client gone');
    const log = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'client' AND action = 'delete'`).get();
    assert.ok(log, 'delete logged for sync');
    assert.equal(log.entity_id, 2);

    // Alice has a sale → should be blocked
    await call(srv, 'POST', '/api/sales', {
      client_id: 1,
      items: [{ product_id: 1, quantity: 1, unit_price: 100 }],
      paid_amount: 100,
      payment_method: 'cash',
      date: new Date().toISOString().slice(0, 10),
    });
    const blocked = await call(srv, 'DELETE', '/api/clients/1');
    assert.equal(blocked.status, 409, 'blocked because sales exist');
    const stillThere = db.prepare('SELECT id FROM clients WHERE id = 1').get();
    assert.ok(stillThere, 'client preserved');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 8 — DELETE /api/clients non-admin returns 403
// ============================================================================
test('DELETE /:id requires admin', async () => {
  seed();
  const app = buildApp({ role: 'sales' });
  const srv = await listen(app);
  try {
    const r = await call(srv, 'DELETE', '/api/clients/2');
    assert.equal(r.status, 403, 'non-admin blocked');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 9 — POST /:id/adjust requires admin
// ============================================================================
test('POST /:id/adjust requires admin', async () => {
  seed();
  const app = buildApp({ role: 'sales' });
  const srv = await listen(app);
  try {
    const r = await call(srv, 'POST', '/api/clients/1/adjust', { amount: 100, reason: 'x' });
    assert.equal(r.status, 403, 'sales role blocked');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 10 — PATCH /api/clients/:id edits profile + logs update
// ============================================================================
test('PATCH /:id updates profile fields + logs sync update', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    const r = await call(srv, 'PATCH', '/api/clients/1', {
      name: 'Alice Smith', phone: '0123456', email: 'a@x.com',
    });
    assert.equal(r.status, 200, 'edit ok');
    const row = db.prepare('SELECT * FROM clients WHERE id = 1').get();
    assert.equal(row.name, 'Alice Smith');
    assert.equal(row.phone, '0123456');
    assert.equal(row.email, 'a@x.com');
    const log = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'client' AND action = 'update'`).get();
    assert.ok(log, 'update logged');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 11 — PATCH /api/suppliers/payments/:id mutates with delta-balance
// ============================================================================
test('PATCH supplier payment adjusts amount with proper balance delta', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    const create = await call(srv, 'POST', '/api/suppliers/1/payments', { amount: 1000 });
    assert.equal(create.status, 201);
    const paymentId = create.body.data.payment_id;

    let s = db.prepare('SELECT balance FROM suppliers WHERE id = 1').get();
    assert.equal(s.balance, 1000, 'balance after 1000 payment');

    // Edit down: 1000 → 700, delta = -300
    const edit = await call(srv, 'PATCH', `/api/suppliers/payments/${paymentId}`, { amount: 700 });
    assert.equal(edit.status, 200, 'edit ok');
    s = db.prepare('SELECT balance FROM suppliers WHERE id = 1').get();
    assert.equal(s.balance, 700, 'balance moves by delta');

    const log = db.prepare(`SELECT * FROM sync_log WHERE entity_type = 'supplier_payment' AND action = 'update'`).get();
    assert.ok(log, 'update logged');
  } finally { srv.close(); }
});

// ============================================================================
// TEST 12 — Express route ordering: PATCH /payments/:paymentId is reachable
// (not shadowed by PATCH /:id)
// ============================================================================
test('Route ordering: PATCH /payments/:id reaches the right handler', async () => {
  seed();
  const app = buildApp();
  const srv = await listen(app);
  try {
    // Hit a non-existent payment path. If routing is broken, PATCH /:id
    // would intercept and return 400 ("Invalid supplier id" because
    // parseInt('payments') is NaN). With correct routing (segment-count
    // match), it reaches PATCH /payments/:paymentId and returns 404.
    const r = await call(srv, 'PATCH', '/api/suppliers/payments/99999', { amount: 100 });
    assert.equal(r.status, 404, 'reached payments handler (not /:id)');
    assert.match(r.body.error, /Payment not found/i);
  } finally { srv.close(); }
});

// ============================================================================
// Run all tests
// ============================================================================
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`[32m  ✓[0m ${name}`);
      pass++;
    } catch (err) {
      console.log(`[31m  ✗[0m ${name}`);
      console.log(`    ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
      fail++;
    }
  }
  console.log(`\n${pass}/${tests.length} passed${fail ? `, ${fail} failed` : ''}`);
  process.exit(fail ? 1 : 0);
})();
