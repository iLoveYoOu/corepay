const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Apenas admin' });
  }
  next();
}

function getWallet(userId) {
  return db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
}

router.post('/', auth, requireAdmin, (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Nome, email e senha obrigatórios' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(400).json({ ok: false, error: 'Email já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(name, email, hash, 'operator');

    db.prepare(`
      INSERT INTO wallets (user_id, balance_cents)
      VALUES (?, 0)
    `).run(result.lastInsertRowid);

    return result.lastInsertRowid;
  });

  res.json({ ok: true, user_id: tx() });
});

router.get('/', auth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.active, w.balance_cents
    FROM users u
    JOIN wallets w ON w.user_id = u.id
    WHERE u.role != 'admin'
    ORDER BY u.id DESC
  `).all();

  res.json({
    ok: true,
    users: users.map(u => ({ ...u, balance: u.balance_cents / 100 }))
  });
});

router.put('/:id', auth, requireAdmin, (req, res) => {
  const { name, email, password } = req.body;
  const id = Number(req.params.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role != ?').get(id, 'admin');
  if (!user) return res.status(404).json({ ok: false, error: 'Operador não encontrado' });

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?')
      .run(name || user.name, email || user.email, hash, id);
  } else {
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
      .run(name || user.name, email || user.email, id);
  }

  res.json({ ok: true });
});

router.patch('/:id/toggle', auth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role != ?').get(id, 'admin');
  if (!user) return res.status(404).json({ ok: false, error: 'Operador não encontrado' });

  const active = user.active ? 0 : 1;

  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, id);

  res.json({ ok: true, active });
});

router.delete('/:id', auth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role != ?').get(id, 'admin');
  if (!user) return res.status(404).json({ ok: false, error: 'Operador não encontrado' });

  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);

  res.json({ ok: true });
});

router.post('/:id/balance', auth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { amount, type, description } = req.body;

  const cents = Math.round(Number(amount) * 100);
  if (!cents || cents <= 0) return res.status(400).json({ ok: false, error: 'Valor inválido' });

  const wallet = getWallet(id);
  if (!wallet) return res.status(404).json({ ok: false, error: 'Wallet não encontrada' });

  const finalAmount = type === 'debit' ? -cents : cents;
  const newBalance = wallet.balance_cents + finalAmount;

  if (newBalance < 0) {
    return res.status(400).json({ ok: false, error: 'Saldo insuficiente' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?').run(newBalance, wallet.id);

    db.prepare(`
      INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      wallet.id,
      type === 'debit' ? 'admin_debit' : 'admin_credit',
      finalAmount,
      newBalance,
      description || (type === 'debit' ? 'Retirada admin' : 'Crédito admin')
    );
  });

  tx();

  res.json({ ok: true, balance: newBalance / 100 });
});

router.get('/:id/statement', auth, requireAdmin, (req, res) => {
  const wallet = getWallet(Number(req.params.id));
  if (!wallet) return res.status(404).json({ ok: false, error: 'Wallet não encontrada' });

  const rows = db.prepare(`
    SELECT *
    FROM ledger
    WHERE wallet_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(wallet.id);

  res.json({
    ok: true,
    transactions: rows.map(r => ({
      ...r,
      amount: r.amount_cents / 100,
      balance_after: r.balance_after_cents / 100
    }))
  });
});

module.exports = router;