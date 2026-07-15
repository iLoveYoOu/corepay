const Database = require('better-sqlite3');

const db = new Database('corepay.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some(item => item.name === column);
}

/*
 * Estrutura original do CorePay.
 */
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
 * CorePay Enterprise.
 */
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  actor_user_id INTEGER,
  target_user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id),
  FOREIGN KEY (target_user_id) REFERENCES users(id)
);
`);

/*
 * Migração segura para bancos antigos.
 */
if (!columnExists('users', 'company_id')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN company_id INTEGER
  `);
}

if (!columnExists('users', 'last_login_at')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN last_login_at TEXT
  `);
}

if (!columnExists('users', 'updated_at')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN updated_at TEXT
  `);
}

/*
 * Empresa padrão.
 */
db.prepare(`
  INSERT OR IGNORE INTO companies (
    name,
    code,
    active
  )
  VALUES ('Empresa Principal', 'SP', 1)
`).run();

const defaultCompany = db.prepare(`
  SELECT id
  FROM companies
  WHERE code = 'SP'
`).get();

if (defaultCompany) {
  db.prepare(`
    UPDATE users
    SET company_id = ?
    WHERE company_id IS NULL
  `).run(defaultCompany.id);
}

/*
 * Garante carteira para todos os usuários.
 */
db.prepare(`
  INSERT INTO wallets (
    user_id,
    balance_cents
  )
  SELECT
    u.id,
    0
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM wallets w
    WHERE w.user_id = u.id
  )
`).run();

db.exec(`
CREATE INDEX IF NOT EXISTS idx_users_company
ON users(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_company
ON audit_logs(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_actor
ON audit_logs(actor_user_id);
`);

console.log('Banco CorePay verificado e migrado.');

module.exports = db;
