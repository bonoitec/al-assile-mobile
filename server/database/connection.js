const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/data/inventory.db'
  : path.join(__dirname, '../../data/inventory.db');

// Ensure data directory exists before opening the database
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL mode: allows concurrent reads while a write is in progress.
// Critical for a server that handles mobile requests and sync pushes simultaneously.
db.pragma('journal_mode = WAL');

// Enforce referential integrity at the SQLite level.
// Must be set per-connection; better-sqlite3 does not persist this between opens.
db.pragma('foreign_keys = ON');

module.exports = db;
