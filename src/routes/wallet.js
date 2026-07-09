const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function getWallet(userId) {
  return db.prepare(`
    SELECT w.id, w.balance_cents, u.name, u.email, u.role
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    WHERE w.user_id = ?
  `).get(userId);
}

router.get('/me', auth, (req, res) => {
  const wallet = getWallet(req.user.id);

  res.json({
    ok: true,
    wallet: {
      ...wallet,
      balance: wallet.balance_cents / 100
    }
  });
});

router.get('/statement', auth, (req, res) => {
  const wallet = getWallet(req.user.id);

  const rows = db.prepare(`
    SELECT *
    FROM ledger
    WHERE wallet_id = ?
    ORDER BY id DESC
    LIMIT 50
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

router.post('/deposit', auth, (req, res) => {
  const { amount, description } = req.body;

  const cents = Math.round(Number(amount) * 100);

  if (!cents || cents <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'Valor inválido'
    });
  }

  const wallet = getWallet(req.user.id);
  const newBalance = wallet.balance_cents + cents;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE wallets
      SET balance_cents = ?
      WHERE id = ?
    `).run(newBalance, wallet.id);

    db.prepare(`
      INSERT INTO ledger
      (wallet_id, type, amount_cents, balance_after_cents, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      wallet.id,
      'deposit',
      cents,
      newBalance,
      description || 'Depósito manual'
    );
  });

  tx();

  res.json({
    ok: true,
    balance: newBalance / 100
  });
});

module.exports = router;