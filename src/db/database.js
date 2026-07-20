const Database = require('better-sqlite3');

const path = require('path');

const configuredDatabasePath = String(
  process.env.DATABASE_PATH || ''
).trim();

if (
  process.env.NODE_ENV === 'production' &&
  !configuredDatabasePath
) {
  throw new Error(
    'DATABASE_PATH é obrigatório em produção. Configure-o para o disco persistente.'
  );
}

const databasePath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.join(__dirname, '..', '..', 'corepay.db');

const db = new Database(databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

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
  session_version INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS mp_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  status_detail TEXT,
  external_reference TEXT UNIQUE NOT NULL,
  credited INTEGER NOT NULL DEFAULT 0,
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE TABLE IF NOT EXISTS treasury_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  operation_code TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  capital_initial_cents INTEGER NOT NULL,
  capital_available_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_by INTEGER,
  reopened_at TEXT,
  reopened_by INTEGER,
  UNIQUE(company_id, operation_code),
  UNIQUE(company_id, operation_date),
  FOREIGN KEY (company_id) REFERENCES companies(id),
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
  reversal_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (treasury_day_id) REFERENCES treasury_days(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
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

if (!columnExists('users', 'last_login_ip')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN last_login_ip TEXT
  `);
}

if (!columnExists('users', 'updated_at')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN updated_at TEXT
  `);
}

if (!columnExists('users', 'username')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN username TEXT
  `);
}

db.prepare(`
  UPDATE users
  SET username = email
  WHERE username IS NULL
`).run();

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username)
`);

function hasLegacyTreasuryUniqueConstraints() {
  return db
    .prepare(`PRAGMA index_list('treasury_days')`)
    .all()
    .filter(index => index.unique)
    .some(index => {
      const columns = db
        .prepare(`
          SELECT name
          FROM pragma_index_info(?)
          ORDER BY seqno
        `)
        .all(index.name)
        .map(column => column.name);

      return (
        columns.length === 1 &&
        ['operation_code', 'operation_date'].includes(columns[0])
      );
    });
}

function migrateLegacyTreasuryConstraints() {
  if (!hasLegacyTreasuryUniqueConstraints()) {
    return;
  }

  db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS treasury_days__migrated;

        CREATE TABLE treasury_days__migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER,
          operation_code TEXT NOT NULL,
          operation_date TEXT NOT NULL,
          capital_initial_cents INTEGER NOT NULL,
          capital_available_cents INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          created_by INTEGER NOT NULL,
          opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_at TEXT,
          closed_by INTEGER,
          reopened_at TEXT,
          reopened_by INTEGER,
          UNIQUE(company_id, operation_code),
          UNIQUE(company_id, operation_date),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (closed_by) REFERENCES users(id),
          FOREIGN KEY (reopened_by) REFERENCES users(id)
        );

        INSERT INTO treasury_days__migrated (
          id,
          company_id,
          operation_code,
          operation_date,
          capital_initial_cents,
          capital_available_cents,
          status,
          created_by,
          opened_at,
          closed_at,
          closed_by,
          reopened_at,
          reopened_by
        )
        SELECT
          id,
          company_id,
          operation_code,
          operation_date,
          capital_initial_cents,
          capital_available_cents,
          status,
          created_by,
          opened_at,
          closed_at,
          closed_by,
          reopened_at,
          reopened_by
        FROM treasury_days;

        DROP TABLE treasury_days;
        ALTER TABLE treasury_days__migrated
          RENAME TO treasury_days;
      `);

      const violations = db
        .prepare('PRAGMA foreign_key_check')
        .all();

      if (violations.length) {
        throw new Error(
          'A migração da tesouraria encontrou referências inválidas.'
        );
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

if (!columnExists('users', 'session_version')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0
  `);
}

if (!columnExists('treasury_days', 'company_id')) {
  db.exec(`
    ALTER TABLE treasury_days
    ADD COLUMN company_id INTEGER
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

  db.prepare(`
    UPDATE treasury_days
    SET company_id = ?
    WHERE company_id IS NULL
  `).run(defaultCompany.id);
}

migrateLegacyTreasuryConstraints();

/*
 * O perfil Atendente foi removido.
 * Contas antigas preservam seus dados e passam a operar como Operador.
 */
db.prepare(`
  UPDATE users
  SET role = 'operator',
      updated_at = CURRENT_TIMESTAMP
  WHERE role = 'attendant'
`).run();

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

/*
 * Grupos / responsáveis.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS responsavel_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  admin_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);
`);

if (!columnExists('users', 'group_id')) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN group_id INTEGER
  `);
}

const existingGroups = db.prepare(
  'SELECT COUNT(*) AS total FROM responsavel_groups'
).get();

if (existingGroups.total === 0) {
  const insertGroup = db.prepare(`
    INSERT INTO responsavel_groups (name, active)
    VALUES (?, 1)
  `);

  for (const name of ['Lucão', 'Gordão', 'Meu grupo']) {
    insertGroup.run(name);
  }
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_users_group
ON users(group_id);

CREATE INDEX IF NOT EXISTS idx_groups_admin
ON responsavel_groups(admin_user_id);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_users_company
ON users(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_company
ON audit_logs(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_actor
ON audit_logs(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_mp_deposits_user
ON mp_deposits(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_mp_deposits_status
ON mp_deposits(status, credited);

CREATE INDEX IF NOT EXISTS idx_treasury_days_date
ON treasury_days(operation_date);

CREATE INDEX IF NOT EXISTS idx_treasury_days_company_date
ON treasury_days(company_id, operation_date);

CREATE INDEX IF NOT EXISTS idx_treasury_balances_day
ON treasury_bank_balances(treasury_day_id);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_day
ON treasury_transactions(treasury_day_id, id);
`);

console.log('Banco CorePay verificado e migrado.');

module.exports = db;
