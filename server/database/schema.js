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

  console.log('[schema] Database initialized successfully');
};

module.exports = { initDatabase };
