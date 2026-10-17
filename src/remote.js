'use strict';
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const scrypt = require('util').promisify(crypto.scrypt);

function createRemoteRouter({ passwordHash = process.env.ARTAUTO_REMOTE_PASSWORD_HASH, secure = true, pairingStore = null } = {}) {
  const router = express.Router();
  const sessions = new Map(), failures = new Map();
  let pairing = null;
  const devices = new Map();
  const random = () => crypto.randomBytes(32).toString('hex');
  const digest = s => crypto.createHash('sha256').update(s).digest('hex');
  const saved = pairingStore?.load();
  for (const d of (Array.isArray(saved) ? saved : saved ? [saved] : [])) {
    if (d.expiresAt > Date.now() && d.passwordFingerprint === digest(passwordHash || '')) {
      const id = d.id || 'legacy';
      devices.set(id, { ...d, id, lastSeen: 0, frame: null, commands: [] });
    }
  }
  const prune = () => { for (const [id, d] of devices) if (d.expiresAt <= Date.now()) { pairingStore?.clear(id); devices.delete(id); } };
  const selectDevice = req => {
    prune();
    const id = req.body?.deviceId || req.query.deviceId;
    return id ? devices.get(id) : devices.size === 1 ? devices.values().next().value : null;
  };
  const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
    && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; frame-ancestors 'none'");
    if (req.method !== 'GET' && req.headers.origin) {
      const expected = `${req.protocol}://${req.get('host')}`;
      if (req.headers.origin !== expected) return res.status(403).json({ error: 'Origem invalida' });
    }
    next();
  });
  router.get('/', (req, res) => res.sendFile(path.join(__dirname, '../remote-panel/index.html')));
  router.get('/panel.js', (req, res) => res.sendFile(path.join(__dirname, '../remote-panel/panel.js')));
  router.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, '../remote-panel/style.css')));
  router.post('/api/login', express.json({ limit: '2kb' }), async (req, res, next) => {
    try {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
    for (const [key, value] of failures) if (value.until < now) failures.delete(key);
    if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(passwordHash || '')) return res.status(503).json({ error: 'Remote ainda nao configurado' });
    const attempt = failures.get(req.ip) || { count: 0, until: now + 600000 };
    if (attempt.count >= 5) return res.status(429).json({ error: 'Aguarde 10 minutos' });
    attempt.count++; failures.set(req.ip, attempt);
    const [salt, expected] = passwordHash.split(':');
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    const actual = (await scrypt(supplied, salt, 32)).toString('hex');
    if (req.body?.username !== 'Admin' || !equal(actual, expected)) {
      return res.status(401).json({ error: 'Login ou senha invalidos' });
    }
    failures.delete(req.ip);
    if (sessions.size >= 100) return res.status(503).json({ error: 'Tente novamente' });
    const token = random(), csrf = random();
    sessions.set(digest(token), { expires: now + 8 * 3600000, csrf });
    res.set('Set-Cookie', `artauto_remote=${token}; HttpOnly; SameSite=Strict; Path=/remote; Max-Age=28800${secure ? '; Secure' : ''}`);
    res.json({ csrf });
    } catch (error) { next(error); }
  });
  const browserAuth = (req, res, next) => {
    const cookie = /(?:^|;\s*)artauto_remote=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    const session = cookie && sessions.get(digest(cookie[1]));
    if (!session || session.expires < Date.now()) return res.status(401).json({ error: 'Entre novamente' });
    if (req.method !== 'GET' && !equal(req.get('x-remote-csrf'), session.csrf)) return res.status(403).json({ error: 'Sessao invalida' });
    req.remoteSession = session;
    next();
  };
  const deviceAuth = (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer /, '');
    prune();
    const device = [...devices.values()].find(d => equal(digest(token), d.tokenHash));
    if (!device) return res.status(401).json({ error: 'Pareie novamente' });
    req.remoteDevice = device;
    device.lastSeen = Date.now(); next();
  };
  router.get('/api/session', browserAuth, (req, res) => res.json({ csrf: req.remoteSession.csrf }));
  router.post('/api/pair-code', browserAuth, (req, res) => {
    prune();
    if (devices.size >= 2) return res.status(409).json({ error: 'Dois aparelhos já pareados. Revogue um deles antes de adicionar outro.' });
    pairing = { code: crypto.randomInt(10000000, 100000000).toString(), expires: Date.now() + 120000, attempts: 0 };
    res.json({ code: pairing.code, expiresAt: pairing.expires });
  });
  router.post('/api/device/pair', express.json({ limit: '2kb' }), (req, res) => {
    if (!pairing || pairing.expires < Date.now() || ++pairing.attempts > 5
      || !equal(String(req.body.code || ''), pairing.code)) return res.status(401).json({ error: 'Codigo invalido ou expirado' });
    prune();
    if (devices.size >= 2) return res.status(409).json({ error: 'Limite de dois aparelhos atingido' });
    const token = random();
    const device = { id: crypto.randomUUID(), tokenHash: digest(token), name: String(req.body.name || 'Android').slice(0, 80), expiresAt: Date.now() + 90 * 86400000,
      passwordFingerprint: digest(passwordHash || ''), lastSeen: Date.now(), frame: null, commands: [] };
    pairingStore?.save(device);
    devices.set(device.id, device); pairing = null;
    res.json({ token, deviceId: device.id });
  });
  router.post('/api/device/frame', deviceAuth, express.raw({ type: 'image/jpeg', limit: '1mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 4 || req.body[0] !== 255 || req.body[1] !== 216) return res.sendStatus(400);
    req.remoteDevice.frame = req.body; req.remoteDevice.frameHash = crypto.createHash('sha256').update(req.body).digest('hex'); req.remoteDevice.frameAt = Date.now(); res.sendStatus(204);
  });
  router.get('/api/device/commands', deviceAuth, (req, res) => {
    const commands = req.remoteDevice.commands.splice(0).filter(x => Date.now() - x.at < 5000);
    res.json({ commands });
  });
  router.get('/api/device/resume', deviceAuth, (req, res) => res.json({ name: req.remoteDevice.name, deviceId: req.remoteDevice.id }));
  router.post('/api/device/stop', deviceAuth, (req, res) => { const device = req.remoteDevice; device.lastSeen = 0; device.frame = null; device.frameAt = 0; device.commands = []; res.sendStatus(204); });
  router.get('/api/status', browserAuth, (req, res) => {
    prune();
    const rows = [...devices.values()].map(d => ({ id: d.id, name: d.name, online: Date.now()-d.lastSeen < 10000, frameAt: d.frameAt || 0 }));
    res.json({ version: '2.0', devices: rows, online: rows.length === 1 && rows[0].online, name: rows.length === 1 ? rows[0].name : '', frameAt: rows.length === 1 ? rows[0].frameAt : 0 });
  });
  router.get('/api/frame', browserAuth, (req, res) => {
    const device = selectDevice(req);
    if (!device?.frame || Date.now() - device.frameAt > 10000) return res.sendStatus(404);
    res.set('X-Frame-Hash', device.frameHash);
    if (req.query.since === device.frameHash) return res.status(204).end();
    res.type('image/jpeg').send(device.frame);
  });
  router.post('/api/command', browserAuth, express.json({ limit: '4kb' }), (req, res) => {
    const device = selectDevice(req);
    if (!device || !device.frameAt || Date.now() - device.frameAt > 5000) return res.status(409).json({ error: 'Celular sem imagem atual' });
    const { type, x, y, x2, y2, text } = req.body;
    if (!['tap', 'swipe', 'back', 'home', 'recents', 'text', 'insert', 'backspace', 'delete'].includes(type)) return res.sendStatus(400);
    if (['tap', 'swipe'].includes(type) && ![x,y,...(type === 'swipe' ? [x2,y2] : [])].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return res.sendStatus(400);
    if (['text', 'insert'].includes(type) && (typeof text !== 'string' || text.length > 1000)) return res.sendStatus(400);
    if (device.commands.length >= 20) return res.sendStatus(429);
    device.commands.push({ type, x, y, x2, y2, text, at: Date.now() }); res.sendStatus(202);
  });
  router.post('/api/disconnect', browserAuth, express.json({ limit: '2kb' }), (req, res) => {
    const device = selectDevice(req);
    if (!device) return res.status(409).json({ error: 'Selecione o aparelho a revogar' });
    pairingStore?.clear(device.id); devices.delete(device.id); pairing = null; res.sendStatus(204);
  });
  router.post('/api/logout', browserAuth, (req, res) => {
    for (const [key, value] of sessions) if (value === req.remoteSession) sessions.delete(key);
    res.set('Set-Cookie', `artauto_remote=; HttpOnly; SameSite=Strict; Path=/remote; Max-Age=0${secure ? '; Secure' : ''}`);
    res.sendStatus(204);
  });
  router.use((req, res) => res.status(404).json({ error: 'Rota Remote inexistente' }));
  return router;
}
module.exports = { createRemoteRouter };
