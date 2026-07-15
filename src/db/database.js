const Database = require('better-sqlite3');

const db = new Database('corepay.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

/*
 * Um registro representa um dia operacional:
 * 08:30 até 03:00 do dia seguinte.
 */
CREATE TABLE IF NOT EXISTS treasury_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_code TEXT UNIQUE NOT NULL,
  operation_date TEXT UNIQUE NOT NULL,
  capital_initial_cents INTEGER NOT NULL,
  capital_available_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_by INTEGER,
  reopened_at TEXT,
  reopened_by INTEGER,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id),
  FOREIGN KEY (reopened_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS treasury_bank_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treasury_day_id INTEGER NOT NULL,
  bank_code TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(treasury_day_id, bank_code),
  FOREIGN KEY (treasury_day_id) REFERENCES treasury_days(id)
);

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treasury_day_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  bank_code TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT,
  capital_before_cents INTEGER NOT NULL,
  capital_after_cents INTEGER NOT NULL,
  bank_before_cents INTEGER NOT NULL,
  bank_after_cents INTEGER NOT NULL,
  reversed INTEGER NOT NULL DEFAULT 0,
  reversed_at TEXT,
  reversed_by INTEGER,
  reversal_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (treasury_day_id) REFERENCES treasury_days(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reversed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_day
ON treasury_transactions(treasury_day_id);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_created
ON treasury_transactions(created_at);
`);

module.exports = db;
