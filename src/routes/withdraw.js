const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

router.post('/', auth, (req, res) => {
  const { amount, pixKey } = req.body;
  const cents = Math.round(Number(amount) * 100);

  if (!cents || cents <= 0) {
    return res.status(400).json({ ok: false, error: 'Valor inválido' });
  }

  if (!pixKey) {
    return res.status(400).json({ ok: false, error: 'Chave Pix obrigatória' });
  }

  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);

  if (wallet.balance_cents < cents) {
    return res.status(400).json({ ok: false, error: 'Saldo insuficiente' });
  }

  const newBalance = wallet.balance_cents - cents;

  db.transaction(() => {
    db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?')
      .run(newBalance, wallet.id);

    db.prepare(`
      INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      wallet.id,
      'withdraw',
      -cents,
      newBalance,
      `Saque para Pix: ${pixKey}`
    );
  })();

  res.json({
    ok: true,
    withdrawn: true,
    balance: newBalance / 100
  });
});

module.exports = router;