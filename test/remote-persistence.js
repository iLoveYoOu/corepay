'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const Database = require('better-sqlite3');
const { createPairingStore } = require('../src/remote-pairing-store');
const { createRemoteRouter } = require('../src/remote');
(async () => {
  const db = new Database(':memory:'), store = createPairingStore(db);
  const password = crypto.randomBytes(20).toString('hex'), salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
  let server, base, cookie, csrf;
  const start = async (passwordHash = hash) => {
    const app = express(); app.use('/remote', createRemoteRouter({ passwordHash, secure: false, pairingStore: store }));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    base = 'http://127.0.0.1:' + server.address().port + '/remote/api/';
  };
  const stop = async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); };
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie || '', 'X-Remote-CSRF': csrf || '' }, body: JSON.stringify(body) });
  const login = async () => { const r = await post('login', { username: 'Admin', password }); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await r.json()).csrf; };
  try {
    await start(); await login();
    const { code } = await (await post('pair-code', {})).json();
    const { token } = await (await post('device/pair', { code, name: 'Test' })).json();
    const headers = { Authorization: 'Bearer ' + token };
    assert(!JSON.stringify(store.load()).includes(token));
    await stop(); await start();
    assert.equal((await fetch(base + 'device/resume', { headers })).status, 200);
    await fetch(base + 'device/stop', { method: 'POST', headers });
    assert.equal((await fetch(base + 'device/resume', { headers })).status, 200);
    await login();
    assert.equal((await post('command', { type: 'text', text: '123' })).status, 409);
    await fetch(base + 'device/frame', { method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: Buffer.from([255,216,255,217]) });
    assert.equal((await post('command', { type: 'text', text: '123' })).status, 202);
    await post('disconnect', {}); await stop(); await start();
    assert.equal((await fetch(base + 'device/resume', { headers })).status, 401);
    console.log('REMOTE_PERSISTENCE_STOP_RESUME_REVOCATION_TEXT_TESTS_OK');
  } finally { if(server?.listening) await stop(); db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
