'use strict';
// Isolated Remote state; financial tables are not read or modified.
function createPairingStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS artauto_remote_pairing (
    slot INTEGER PRIMARY KEY CHECK (slot = 1),
    token_hash TEXT NOT NULL,
    device_name TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    password_fingerprint TEXT NOT NULL
  )`);
  return {
    load() { const row = db.prepare('SELECT * FROM artauto_remote_pairing WHERE slot = 1').get();
      return row && { tokenHash: row.token_hash, name: row.device_name, expiresAt: row.expires_at, passwordFingerprint: row.password_fingerprint }; },
    save(d) { db.prepare(`INSERT INTO artauto_remote_pairing VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(slot) DO UPDATE SET token_hash=excluded.token_hash, device_name=excluded.device_name,
      expires_at=excluded.expires_at, password_fingerprint=excluded.password_fingerprint`).run(d.tokenHash,d.name,d.expiresAt,d.passwordFingerprint); },
    clear() { db.prepare('DELETE FROM artauto_remote_pairing WHERE slot = 1').run(); }
  };
}
module.exports = { createPairingStore };
