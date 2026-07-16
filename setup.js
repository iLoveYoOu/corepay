require('dotenv').config();

const seedAdmin = require('./src/db/seedAdmin');

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error(
    'Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de executar o setup.'
  );
}

seedAdmin();
console.log('Setup administrativo concluído sem credenciais padrão.');
