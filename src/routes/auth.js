const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const authMiddleware = require('../middlewares/auth');

const router = express.Router();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_MAX_TRACKED_KEYS = 10000;
const LOGIN_CLEANUP_INTERVAL_MS = 60 * 1000;
let lastLoginCleanupAt = 0;

function attemptKey(req, email) {
  return `${req.ip || 'unknown'}:${email.slice(0, 320)}`;
}

function cleanupLoginAttempts(
  now = Date.now(),
  force = false
) {
  if (
    !force &&
    now - lastLoginCleanupAt < LOGIN_CLEANUP_INTERVAL_MS &&
    loginAttempts.size <= LOGIN_MAX_TRACKED_KEYS
  ) {
    return;
  }

  for (const [key, record] of loginAttempts) {
    if (now - record.startedAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }

  while (loginAttempts.size > LOGIN_MAX_TRACKED_KEYS) {
    const oldestKey = loginAttempts.keys().next().value;
    loginAttempts.delete(oldestKey);
  }

  lastLoginCleanupAt = now;
}

function currentAttempts(key) {
  cleanupLoginAttempts();

  const record = loginAttempts.get(key);

  if (!record || Date.now() - record.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return null;
  }

  return record;
}

function registerFailedAttempt(key) {
  const record = currentAttempts(key) || {
    count: 0,
    startedAt: Date.now()
  };

  record.count += 1;

  if (
    !loginAttempts.has(key) &&
    loginAttempts.size >= LOGIN_MAX_TRACKED_KEYS
  ) {
    const oldestKey = loginAttempts.keys().next().value;
    loginAttempts.delete(oldestKey);
  }

  loginAttempts.set(key, record);
}

const loginCleanupTimer = setInterval(
  () => cleanupLoginAttempts(Date.now(), true),
  LOGIN_CLEANUP_INTERVAL_MS
);

loginCleanupTimer.unref?.();

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      companyId: user.company_id,
      sessionVersion: Number(user.session_version || 0)
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

router.post('/login', (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();

  const password = String(req.body.password || '');
  const key = attemptKey(req, email);
  const attempts = currentAttempts(key);

  if (attempts && attempts.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({
      ok: false,
      error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    });
  }

  const user = db.prepare(`
    SELECT
      u.*,
      c.active AS company_active,
      c.name AS company_name,
      c.code AS company_code
    FROM users u
    LEFT JOIN companies c
      ON c.id = u.company_id
    WHERE u.email = ?
      AND u.active = 1
  `).get(email);

  if (
    !user ||
    !bcrypt.compareSync(
      password,
      user.password_hash
    )
  ) {
    registerFailedAttempt(key);

    return res.status(401).json({
      ok: false,
      error: 'Login inválido'
    });
  }

  loginAttempts.delete(key);

  if (
    user.role !== 'super_admin' &&
    !user.company_active
  ) {
    return res.status(403).json({
      ok: false,
      error: 'Empresa inativa.'
    });
  }

  db.prepare(`
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id);

  const token = createToken(user);

  return res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name,
      companyCode: user.company_code,
      sessionVersion: Number(
        user.session_version || 0
      )
    }
  });
});

router.post(
  '/change-password',
  authMiddleware,
  (req, res) => {
    const {
      currentPassword,
      newPassword
    } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        ok: false,
        error:
          'Senha atual e nova senha obrigatórias'
      });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({
        ok: false,
        error:
          'Nova senha deve ter no mínimo 8 caracteres'
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    if (
      !user ||
      !bcrypt.compareSync(
        currentPassword,
        user.password_hash
      )
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Senha atual incorreta'
      });
    }

    const hash = bcrypt.hashSync(
      newPassword,
      10
    );

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hash, req.user.id);

    const updatedUser = db.prepare(`
      SELECT
        id,
        role,
        company_id,
        session_version
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    const token = createToken(updatedUser);

    return res.json({
      ok: true,
      token,
      sessionVersion: Number(
        updatedUser.session_version
      )
    });
  }
);

module.exports = router;
