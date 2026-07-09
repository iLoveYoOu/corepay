const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare(`
    SELECT * FROM users
    WHERE email = ? AND active = 1
  `).get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({
      ok: false,
      error: 'Login inválido'
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

const authMiddleware = require('../middlewares/auth');

router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Senha atual e nova senha obrigatórias' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Nova senha deve ter no mínimo 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ ok: false, error: 'Senha atual incorreta' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

  res.json({ ok: true });
});

module.exports = router;