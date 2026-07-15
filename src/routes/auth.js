const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const authMiddleware = require('../middlewares/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();

  const password = String(req.body.password || '');

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
    return res.status(401).json({
      ok: false,
      error: 'Login inválido'
    });
  }

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

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      companyId: user.company_id
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

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
      companyCode: user.company_code
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

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        ok: false,
        error:
          'Nova senha deve ter no mínimo 6 caracteres'
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
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hash, req.user.id);

    return res.json({ ok: true });
  }
);

module.exports = router;
