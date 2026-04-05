require('./server/index.js');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const SK = 'al-assile-sync-key-change-me';
let pass = 0, fail = 0;

async function t(name, fn) {
  try { await fn(); pass++; console.log(' OK', name); }
  catch (e) { fail++; console.log('FAIL', name, e.message); }
}

setTimeout(async () => {
  console.log('\n=== FINAL COMPREHENSIVE TEST ===\n');

  // Push
  await t('Push 3 products + 2 clients + 2 users + settings', async () => {
    const r = await fetch(BASE + '/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SK },
      body: JSON.stringify({
        products: [
          { id: 1, name: 'Deglet Nour 1kg', selling_price: 1200, unit: 'kg', quantity: 25, is_active: 1, is_favorite: 1 },
          { id: 2, name: 'Mech Degla 500g', selling_price: 600, unit: 'pcs', quantity: 40, is_active: 1 },
          { id: 3, name: 'Date Paste', selling_price: 800, unit: 'kg', quantity: 0, is_active: 1 }
        ],
        clients: [
          { id: 1, name: 'Bakery Central', phone: '0555-111', balance: 0 },
          { id: 2, name: 'Restaurant Le Palmier', phone: '0555-222', balance: -5000 }
        ],
        users: [
          { id: 1, username: 'admin', password_hash: bcrypt.hashSync('admin123', 10), name: 'Admin', role: 'admin', is_active: 1 },
          { id: 2, username: 'seller1', password_hash: bcrypt.hashSync('seller123', 10), name: 'Ahmed', role: 'sales', is_active: 1 }
        ],
        settings: [
          { key: 'business_name_fr', value: 'Al Assile - Produits de Dattes' },
          { key: 'business_address', value: 'Rue des Palmiers, Biskra' },
          { key: 'business_phone', value: '033-12-34-56' },
          { key: 'tva_rate', value: '19' }
        ]
      })
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
  });

  let adminToken, sellerToken;
  await t('Admin login', async () => {
    const d = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
    if (!d.success) throw new Error(d.error);
    adminToken = d.token;
  });
  await t('Seller login', async () => {
    const d = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'seller1', password: 'seller123' }) })).json();
    if (!d.success) throw new Error(d.error);
    sellerToken = d.token;
  });
  await t('Bad password rejected', async () => {
    const d = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'wrong' }) })).json();
    if (d.success) throw new Error('should fail');
  });
  await t('401 without token', async () => {
    const r = await fetch(BASE + '/api/products');
    if (r.status !== 401) throw new Error('expected 401');
  });

  await t('Products list = 3', async () => {
    const d = await (await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + adminToken } })).json();
    if (d.data.length !== 3) throw new Error('count: ' + d.data.length);
    if (d.data[0].image_data !== undefined) throw new Error('image_data leaked');
  });
  await t('Clients list = 2', async () => {
    const d = await (await fetch(BASE + '/api/clients', { headers: { Authorization: 'Bearer ' + adminToken } })).json();
    if (d.data.length !== 2) throw new Error('count: ' + d.data.length);
  });
  await t('Settings has business info', async () => {
    const d = await (await fetch(BASE + '/api/settings', { headers: { Authorization: 'Bearer ' + adminToken } })).json();
    if (!d.data.business_name_fr) throw new Error('missing name');
    if (!d.data.business_phone) throw new Error('missing phone');
  });

  // Stock validation
  await t('Reject oversell (999 of 25)', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, date: '2026-04-03', paid_amount: 0, items: [{ product_id: 1, quantity: 999, unit_price: 1200 }] }) })).json();
    if (d.success) throw new Error('should reject');
  });
  await t('Reject out-of-stock (qty=0)', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, date: '2026-04-03', paid_amount: 0, items: [{ product_id: 3, quantity: 1, unit_price: 800 }] }) })).json();
    if (d.success) throw new Error('should reject zero stock');
  });
  await t('Reject unknown product', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, date: '2026-04-03', paid_amount: 0, items: [{ product_id: 99, quantity: 1, unit_price: 100 }] }) })).json();
    if (d.success) throw new Error('should reject');
  });
  await t('Reject missing date', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, paid_amount: 0, items: [{ product_id: 1, quantity: 1, unit_price: 1200 }] }) })).json();
    if (d.success) throw new Error('should reject no date');
  });
  await t('Reject empty items', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, date: '2026-04-03', paid_amount: 0, items: [] }) })).json();
    if (d.success) throw new Error('should reject empty');
  });

  // Valid sales
  await t('Sale: paid in full', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 1, date: '2026-04-03', paid_amount: 1800, items: [{ product_id: 1, quantity: 1, unit_price: 1200 }, { product_id: 2, quantity: 1, unit_price: 600 }] }) })).json();
    if (!d.success) throw new Error(d.error);
    if (d.data.total !== 1800) throw new Error('total: ' + d.data.total);
    if (d.data.status !== 'paid') throw new Error('status: ' + d.data.status);
    if (d.data.items.length !== 2) throw new Error('items: ' + d.data.items.length);
  });
  await t('Sale: partial payment', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: 2, date: '2026-04-03', paid_amount: 500, items: [{ product_id: 2, quantity: 2, unit_price: 600 }] }) })).json();
    if (!d.success) throw new Error(d.error);
    if (d.data.status !== 'partial') throw new Error('status: ' + d.data.status);
  });
  await t('Sale: pending (no payment)', async () => {
    const d = await (await fetch(BASE + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerToken }, body: JSON.stringify({ client_id: null, date: '2026-04-03', paid_amount: 0, items: [{ product_id: 2, quantity: 1, unit_price: 600 }] }) })).json();
    if (!d.success) throw new Error(d.error);
    if (d.data.status !== 'pending') throw new Error('status: ' + d.data.status);
  });

  // Stock check
  await t('Stock deducted correctly', async () => {
    const d = await (await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + adminToken } })).json();
    const p1 = d.data.find(p => p.id === 1);
    const p2 = d.data.find(p => p.id === 2);
    if (p1.quantity !== 24) throw new Error('Deglet: ' + p1.quantity + ' (expected 24)');
    if (p2.quantity !== 36) throw new Error('Mech: ' + p2.quantity + ' (expected 36)');
  });

  // Sales list
  await t('Sales list = 3, correct fields', async () => {
    const d = await (await fetch(BASE + '/api/sales?date=2026-04-03', { headers: { Authorization: 'Bearer ' + sellerToken } })).json();
    if (d.data.length !== 3) throw new Error('count: ' + d.data.length);
    const s = d.data[0];
    if (s.total === undefined) throw new Error('missing .total');
    if (s.paid_amount === undefined) throw new Error('missing .paid_amount');
    if (s.status === undefined) throw new Error('missing .status');
  });

  // Sale detail
  await t('Sale detail has items + client', async () => {
    const d = await (await fetch(BASE + '/api/sales/1', { headers: { Authorization: 'Bearer ' + adminToken } })).json();
    if (!d.data.items || d.data.items.length === 0) throw new Error('no items');
    if (!d.data.client_name) throw new Error('no client_name');
  });

  // Sync pull
  await t('Pull returns 3 unsynced sales', async () => {
    const d = await (await fetch(BASE + '/api/sync/pull', { headers: { 'X-Sync-Key': SK } })).json();
    if (d.sales.length !== 3) throw new Error('count: ' + d.sales.length);
    if (!d.sales[0].items || d.sales[0].items.length === 0) throw new Error('items missing');
  });
  await t('Pull again = 0 (already synced)', async () => {
    const d = await (await fetch(BASE + '/api/sync/pull', { headers: { 'X-Sync-Key': SK } })).json();
    if (d.sales.length !== 0) throw new Error('count: ' + d.sales.length);
  });

  // Re-push
  await t('Re-push with FK (sales exist)', async () => {
    const d = await (await fetch(BASE + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SK }, body: JSON.stringify({ products: [{ id: 1, name: 'Deglet', selling_price: 1200, unit: 'kg', quantity: 25, is_active: 1 }], clients: [{ id: 1, name: 'Bakery', phone: '0555', balance: 0 }], users: [{ id: 1, username: 'admin', password_hash: bcrypt.hashSync('admin123', 10), name: 'Admin', role: 'admin', is_active: 1 }], settings: [{ key: 'business_name_fr', value: 'Al Assile' }] }) })).json();
    if (!d.success) throw new Error(d.error);
  });

  // Infra
  await t('Health check', async () => {
    const d = await (await fetch(BASE + '/api/health')).json();
    if (d.status !== 'ok') throw new Error('unhealthy');
  });
  await t('SPA serves HTML', async () => {
    const html = await (await fetch(BASE + '/')).text();
    if (!html.includes('</html>')) throw new Error('not html');
  });
  await t('Bad sync key rejected', async () => {
    const r = await fetch(BASE + '/api/sync/status', { headers: { 'X-Sync-Key': 'wrong-key' } });
    if (r.status !== 401) throw new Error('expected 401');
  });

  console.log('\n=== RESULT: ' + pass + '/' + (pass + fail) + ' passed ===\n');
  process.exit(fail ? 1 : 0);
}, 2000);
