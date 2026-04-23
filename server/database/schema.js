/**
 * schema.js - Mobile server database schema
 *
 * Mirrors the desktop Electron app schema for the tables that the mobile POS
 * needs to read or write.  Tables that only exist on the desktop (stock,
 * suppliers, production_batches, etc.) are intentionally omitted.
 *
 * Sync strategy:
 *   - products / clients / users / settings  → pushed FROM desktop, owned by desktop
 *   - sales / sale_items                     → created on mobile, pulled BY desktop
 *   - sync_log                               → tracks mobile-originated writes
 */

const initDatabase = (db) => {
  // ============================================
  // PRODUCTS
  // image_data stores a full base64-encoded image string so the mobile app
  // can display product photos without a separate file system.
  // image_path from the desktop is ignored on the mobile side.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY,
      name          TEXT    NOT NULL,
      description   TEXT,
      selling_price REAL    DEFAULT 0,
      unit          TEXT    DEFAULT 'pcs',
      barcode       TEXT,
      is_favorite   INTEGER DEFAULT 0,
      image_data    TEXT,
      is_active     INTEGER DEFAULT 1,
      quantity      REAL    DEFAULT 0,
      min_stock_alert REAL  DEFAULT 0,
      is_resale     INTEGER DEFAULT 0,
      purchase_price REAL   DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // CLIENTS
  // balance mirrors the desktop value and is updated on the mobile side when
  // a sale is partially paid.  The desktop reconciles this during sync pull.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      phone      TEXT,
      address    TEXT,
      email      TEXT,
      notes      TEXT,
      balance    REAL    DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // SALES
  // payment_method and created_by are mobile-specific additions.
  // status values match the desktop CHECK constraint exactly.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER,
      date           DATE    NOT NULL,
      subtotal       REAL    DEFAULT 0,
      discount       REAL    DEFAULT 0,
      total          REAL    DEFAULT 0,
      paid_amount    REAL    DEFAULT 0,
      status         TEXT    DEFAULT 'pending'
                             CHECK(status IN ('pending', 'partial', 'paid', 'cancelled', 'return')),
      payment_method TEXT    DEFAULT 'cash',
      notes          TEXT,
      created_by     INTEGER,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id)  REFERENCES clients(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ============================================
  // SALE ITEMS
  // Matches the desktop schema exactly so the desktop can INSERT rows from
  // the sync pull response without any column transformation.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id    INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity   REAL    NOT NULL,
      unit_price REAL    NOT NULL,
      total      REAL    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // ============================================
  // USERS
  // Receives hashed passwords from the desktop sync push.
  // The mobile server validates credentials with bcrypt.compareSync.
  // role CHECK matches the desktop constraint.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      role          TEXT    NOT NULL
                            CHECK(role IN ('admin', 'manager', 'sales')),
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // SETTINGS
  // Key-value store, primary key on key column matches the desktop schema.
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // SYNC LOG
  // Records every write made on the mobile side so the desktop knows what
  // to pull.  synced = 0 means not yet acknowledged by the desktop.
  // entity_type values: 'sale' | 'sale_item'
  // action values:      'create' | 'update' | 'delete'
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT    NOT NULL,
      entity_id   INTEGER NOT NULL,
      action      TEXT    NOT NULL DEFAULT 'create',
      synced      INTEGER NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index to make the pull query fast: only unsynced rows, newest first.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_log_unsynced
    ON sync_log (synced, created_at)
    WHERE synced = 0
  `);

  // Index for product lookups by barcode (used in mobile POS scanner flow).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_barcode
    ON products (barcode)
    WHERE barcode IS NOT NULL
  `);

  // Index to speed up today's-sales queries (most common mobile dashboard query).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sales_date
    ON sales (date)
  `);

  // ============================================
  // CLIENT PAYMENTS — mobile ledger
  // Mirrors the desktop ledger so mobile-recorded versements and per-sale
  // payments flow back during sync pull. Each row = one money movement.
  //   sale_id = X  → paid against a specific sale
  //   sale_id = NULL → on-account credit or adjustment
  //   batch_id groups rows from one versement for display/undo
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_payments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  INTEGER NOT NULL,
      sale_id    INTEGER,
      amount     REAL    NOT NULL,
      date       DATE    NOT NULL,
      method     TEXT    NOT NULL DEFAULT 'cash',
      notes      TEXT,
      batch_id   TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id)  REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (sale_id)    REFERENCES sales(id)   ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_cp_client ON client_payments(client_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cp_sale   ON client_payments(sale_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cp_batch  ON client_payments(batch_id);');

  // Migration: add 'return' to sales status CHECK constraint
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sales'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'return'")) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id      INTEGER REFERENCES clients(id),
          date           TEXT    NOT NULL,
          subtotal       REAL    DEFAULT 0,
          discount       REAL    DEFAULT 0,
          total          REAL    DEFAULT 0,
          paid_amount    REAL    DEFAULT 0,
          status         TEXT    DEFAULT 'pending'
                                 CHECK(status IN ('pending', 'partial', 'paid', 'cancelled', 'return')),
          payment_method TEXT    DEFAULT 'cash',
          notes          TEXT,
          created_by     INTEGER,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO sales_new SELECT * FROM sales;
        DROP TABLE sales;
        ALTER TABLE sales_new RENAME TO sales;
        CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (date);
      `);
      db.pragma('foreign_keys = ON');
      console.log('[schema] Migration: added return status to sales');
    }
  } catch (e) {
    console.log('[schema] Sales migration check:', e.message);
    try { db.pragma('foreign_keys = ON'); } catch (_) {}
  }

  // Migration: add credit-block flag + last-contact metadata to clients.
  // These mirror the desktop schema so the sync-push full replacement carries
  // the fields through. Idempotent via a PRAGMA table_info check.
  try {
    const cols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
    if (!cols.includes('credit_blocked')) {
      db.exec('ALTER TABLE clients ADD COLUMN credit_blocked INTEGER DEFAULT 0');
    }
    if (!cols.includes('last_contact_note')) {
      db.exec('ALTER TABLE clients ADD COLUMN last_contact_note TEXT');
    }
    if (!cols.includes('last_contact_at')) {
      db.exec('ALTER TABLE clients ADD COLUMN last_contact_at DATETIME');
    }
    // remote_id = mobile's own row id, but also set on desktop-pushed clients
    // to point back to themselves. Lets both sides translate references.
    if (!cols.includes('remote_id')) {
      db.exec('ALTER TABLE clients ADD COLUMN remote_id TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_remote_id ON clients(remote_id) WHERE remote_id IS NOT NULL');
    }
  } catch (e) {
    console.log('[schema] clients columns migration:', e.message);
  }

  // ============================================
  // SUPPLIERS (new on mobile — mirror of desktop)
  // Balance direction inverted from clients:
  //   negative = shop owes this supplier
  //   positive = shop has prepayment credit with them
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      phone      TEXT,
      address    TEXT,
      email      TEXT,
      notes      TEXT,
      balance    REAL    DEFAULT 0,
      remote_id  TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_remote_id ON suppliers(remote_id) WHERE remote_id IS NOT NULL');

  // ============================================
  // SUPPLIER_PAYMENTS (new on mobile — mirror of client_payments)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      purchase_id INTEGER,
      amount      REAL    NOT NULL,
      date        DATE    NOT NULL,
      method      TEXT    DEFAULT 'cash',
      notes       TEXT,
      batch_id    TEXT,
      created_by  INTEGER,
      remote_id   TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_payments(supplier_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sp_purchase ON supplier_payments(purchase_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_remote ON supplier_payments(remote_id) WHERE remote_id IS NOT NULL');

  // Migration: add remote_id to sales for desktop-origin sales import.
  // Desktop now pushes its own sales so mobile Reports reflects the whole shop,
  // not just field sales. remote_id='desktop-{id}' on desktop-origin rows; NULL
  // on mobile-origin rows (they keep their own id as the stable identifier that
  // desktop stores in its own sales.remote_id).
  try {
    const cols = db.prepare("PRAGMA table_info(sales)").all().map(c => c.name);
    if (!cols.includes('remote_id')) {
      db.exec('ALTER TABLE sales ADD COLUMN remote_id TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_remote_id ON sales(remote_id) WHERE remote_id IS NOT NULL');
    }
  } catch (e) {
    console.log('[schema] sales.remote_id migration:', e.message);
  }

  // Migration: add remote_id to client_payments. Same dedup strategy as sales.
  // Desktop pushes its ledger here so mobile's client detail page shows a
  // full payment history for counter transactions, not just mobile versements.
  try {
    const cols = db.prepare("PRAGMA table_info(client_payments)").all().map(c => c.name);
    if (!cols.includes('remote_id')) {
      db.exec('ALTER TABLE client_payments ADD COLUMN remote_id TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cp_remote_id ON client_payments(remote_id) WHERE remote_id IS NOT NULL');
    }
  } catch (e) {
    console.log('[schema] client_payments.remote_id migration:', e.message);
  }

  console.log('[schema] Database initialized successfully');
};

module.exports = { initDatabase };
