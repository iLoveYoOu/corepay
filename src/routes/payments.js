const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function getWallet(userId) {
  return db.prepare(`
    SELECT *
    FROM wallets
    WHERE user_id = ?
  `).get(userId);
}

router.post('/manual', auth, (req, res) => {
  const { amount, pix, description } = req.body;

  const cents = Math.round(Number(amount) * 100);

  if (!cents || cents <= 0) {
    return res.status(400).json({ ok: false, error: 'Valor inválido' });
  }

  if (!pix) {
    return res.status(400).json({ ok: false, error: 'Pix obrigatório' });
  }

  const wallet = getWallet(req.user.id);

  if (wallet.balance_cents < cents) {
    return res.status(400).json({
      ok: false,
      error: 'Saldo insuficiente',
      balance: wallet.balance_cents / 100
    });
  }

  const newBalance = wallet.balance_cents - cents;

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
      'payment',
      -cents,
      newBalance,
      description || `Pagamento Pix: ${pix}`
    );
  });

  tx();

  res.json({
    ok: true,
    paid: true,
    balance: newBalance / 100
  });
});

module.exports = router;