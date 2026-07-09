const bcrypt = require('bcryptjs');
const readline = require('readline');
const db = require('./src/db/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Nova senha do administrador: ', async (senha) => {
  try {
    const hash = await bcrypt.hash(senha, 10);

    const r = db.prepare(`
      UPDATE users
      SET email = ?, password_hash = ?, name = ?
      WHERE role = 'admin'
    `).run(
      'arthurcesarmaga@gmail.com',
      hash,
      'Arthur Admin'
    );

    console.log('Administrador atualizado.');
    console.log('Linhas alteradas:', r.changes);
  } catch (e) {
    console.error(e);
  } finally {
    rl.close();
  }
});