const bcrypt = require('bcryptjs');
const db = require('./database');

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD não configurados.');
    return;
  }

  const hash = bcrypt.hashSync(password, 10);

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();

  if (admin) {
    db.prepare(`
      UPDATE users
      SET email = ?, password_hash = ?, name = ?, active = 1
      WHERE id = ?
    `).run(email, hash, 'Arthur Admin', admin.id);

    console.log('Admin atualizado pelo ENV.');
  } else {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES (?, ?, ?, ?, 1)
    `).run('Arthur Admin', email, hash, 'admin');

    db.prepare(`
      INSERT INTO wallets (user_id, balance_cents)
      VALUES (?, 0)
    `).run(result.lastInsertRowid);

    console.log('Admin criado pelo ENV.');
  }
}

module.exports = seedAdmin;
