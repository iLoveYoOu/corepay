const bcrypt = require('bcryptjs');
const db = require('./src/db/database');

const email = 'admin@corepay.local';
const password = '123456';

const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

if (!exists) {
  const hash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Arthur Admin', email, hash, 'admin');

  db.prepare(`
    INSERT INTO wallets (user_id, balance_cents)
    VALUES (?, 0)
  `).run(result.lastInsertRowid);

  console.log('Admin criado:', email, password);
} else {
  console.log('Admin já existe.');
}