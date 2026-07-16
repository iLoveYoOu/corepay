const bcrypt = require('bcryptjs');
const db = require('./database');

function seedAdmin() {
  const email = String(
    process.env.ADMIN_EMAIL || ''
  ).trim().toLowerCase();

  const password = String(
    process.env.ADMIN_PASSWORD || ''
  );

  const name = String(
    process.env.ADMIN_NAME || 'Administrador'
  ).trim();

  const forceSync = String(
    process.env.ADMIN_FORCE_SYNC || ''
  ).trim().toLowerCase() === 'true';

  if (!email || !password) {
    console.log(
      'ADMIN_EMAIL/ADMIN_PASSWORD não configurados.'
    );

    return;
  }

  const company = db.prepare(`
    SELECT id
    FROM companies
    WHERE code = 'SP'
  `).get();

  if (!company) {
    throw new Error(
      'Empresa padrão SP não encontrada.'
    );
  }

  const existing = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

  let userId;

  if (existing) {
    userId = existing.id;

    if (forceSync) {
      const passwordHash = bcrypt.hashSync(
        password,
        10
      );

      db.prepare(`
        UPDATE users
        SET
          name = ?,
          password_hash = ?,
          role = 'super_admin',
          active = 1,
          company_id = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        passwordHash,
        company.id,
        existing.id
      );

      console.log(
        'Super Admin sincronizado pelo ENV.'
      );
    } else {
      console.log(
        'Super Admin existente preservado. Use ADMIN_FORCE_SYNC=true para sincronizar.'
      );
    }
  } else {
    const passwordHash = bcrypt.hashSync(
      password,
      10
    );

    const result = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        active,
        company_id,
        updated_at
      )
      VALUES (
        ?,
        ?,
        ?,
        'super_admin',
        1,
        ?,
        CURRENT_TIMESTAMP
      )
    `).run(
      name,
      email,
      passwordHash,
      company.id
    );

    userId = Number(result.lastInsertRowid);

    console.log(
      'Super Admin criado pelo ENV.'
    );
  }

  db.prepare(`
    INSERT INTO wallets (
      user_id,
      balance_cents
    )
    SELECT ?, 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM wallets
      WHERE user_id = ?
    )
  `).run(userId, userId);
}

module.exports = seedAdmin;
