const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ ok:false, error:'Apenas admin' });
  next();
}

router.post('/wallets/:userId/credit', auth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const cents = Math.round(Number(req.body.amount) * 100);
  if (!cents || cents <= 0) return res.status(400).json({ ok:false, error:'Valor inválido' });

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) return res.status(404).json({ ok:false, error:'Wallet não encontrada' });

  const newBalance = wallet.balance_cents + cents;

  db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?').run(newBalance, wallet.id);
  db.prepare(`
    INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(wallet.id, 'admin_credit', cents, newBalance, req.body.description || 'Crédito admin');

  res.json({ ok:true, balance:newBalance / 100 });
});

router.post('/wallets/:userId/debit', auth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const cents = Math.round(Number(req.body.amount) * 100);
  if (!cents || cents <= 0) return res.status(400).json({ ok:false, error:'Valor inválido' });

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) return res.status(404).json({ ok:false, error:'Wallet não encontrada' });
  if (wallet.balance_cents < cents) return res.status(400).json({ ok:false, error:'Saldo insuficiente' });

  const newBalance = wallet.balance_cents - cents;

  db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?').run(newBalance, wallet.id);
  db.prepare(`
    INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(wallet.id, 'admin_debit', -cents, newBalance, req.body.description || 'Débito admin');

  res.json({ ok:true, balance:newBalance / 100 });
});

router.post('/users/:userId/toggle', auth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare('SELECT active FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ ok:false, error:'Usuário não encontrado' });

  const active = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, userId);

  res.json({ ok:true, active });
});

module.exports = router;
