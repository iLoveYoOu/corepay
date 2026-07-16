require('dotenv').config();

const bcrypt = require('bcryptjs');
const readline = require('readline');
const db = require('./src/db/database');

const email = String(process.env.ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();

if (!email) {
  throw new Error(
    'Defina ADMIN_EMAIL para identificar o administrador.'
  );
}

const admin = db.prepare(`
  SELECT id
  FROM users
  WHERE email = ?
    AND role IN ('admin', 'super_admin')
`).get(email);

if (!admin) {
  throw new Error('Administrador não encontrado.');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Nova senha do administrador: ', async password => {
  try {
    if (String(password).length < 8) {
      throw new Error('A senha deve ter pelo menos 8 caracteres.');
    }

    const hash = await bcrypt.hash(password, 10);

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hash, admin.id);

    console.log('Senha do administrador atualizada.');
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
});
