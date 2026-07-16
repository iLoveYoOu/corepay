const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const database = process.env.DATABASE_PATH;
const replica = process.env.LITESTREAM_REPLICA_URL;
const binary = path.join(__dirname, '..', 'bin', process.platform === 'win32' ? 'litestream.exe' : 'litestream');

if (!database || !replica || !fs.existsSync(binary)) {
  require('../server');
  return;
}

fs.mkdirSync(path.dirname(database), { recursive: true });
if (!fs.existsSync(database)) {
  const restore = spawnSync(binary, ['restore', '-o', database, replica], { stdio: 'inherit', env: process.env });
  if (restore.status === 0) console.log('Banco restaurado da réplica segura.');
  else console.log('Nenhuma réplica anterior; iniciando banco novo.');
}

const child = spawn(binary, ['replicate', '-exec', 'node server.js', database, replica], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

