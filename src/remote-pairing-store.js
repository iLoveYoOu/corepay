'use strict';
// Isolated Remote state; financial tables are not read or modified.
function createPairingStore(db) {
  const migrated = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artauto_remote_devices'").get();
  db.exec(`CREATE TABLE IF NOT EXISTS artauto_remote_pairing (
    slot INTEGER PRIMARY KEY CHECK (slot = 1),
    token_hash TEXT NOT NULL,
    device_name TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    password_fingerprint TEXT NOT NULL
  )`);
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS artauto_remote_devices (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, device_name TEXT NOT NULL,
      expires_at INTEGER NOT NULL, password_fingerprint TEXT NOT NULL
    )`);
    if (!migrated) db.exec(`INSERT INTO artauto_remote_devices
      SELECT 'legacy', token_hash, device_name, expires_at, password_fingerprint FROM artauto_remote_pairing WHERE slot=1`);
  })();
  return {
    load() { return db.prepare('SELECT * FROM artauto_remote_devices').all().map(row => ({
      id: row.id, tokenHash: row.token_hash, name: row.device_name, expiresAt: row.expires_at, passwordFingerprint: row.password_fingerprint
    })); },
    save(d) { db.prepare(`INSERT INTO artauto_remote_devices VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, device_name=excluded.device_name,
      expires_at=excluded.expires_at, password_fingerprint=excluded.password_fingerprint`).run(d.id,d.tokenHash,d.name,d.expiresAt,d.passwordFingerprint); },
    clear(id) { if (id) db.prepare('DELETE FROM artauto_remote_devices WHERE id=?').run(id);
      else db.prepare('DELETE FROM artauto_remote_devices').run(); }
  };
}
module.exports = { createPairingStore };
