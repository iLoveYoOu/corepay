const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.post('/payment', (req, res) => {
  try {
    const event = req.body.event;
    const payment = req.body.payment || {};
    const status = payment.status;
    const externalReference = payment.externalReference || '';

    console.log('WEBHOOK ASAAS PAYMENT:', event, status, externalReference);

    if (!externalReference.startsWith('deposit:')) {
      return res.json({ ok: true, ignored: true });
    }

    if (!['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event)) {
      return res.json({ ok: true, ignored: true });
    }

    const parts = externalReference.split(':');
    const userId = Number(parts[1]);
    const value = Number(payment.value || payment.netValue || 0);
    const cents = Math.round(value * 100);

    if (!userId || !cents || cents <= 0) {
      return res.status(400).json({ ok: false, error: 'Webhook inválido' });
    }

    const already = db.prepare(`
      SELECT id FROM ledger
      WHERE description = ?
    `).get(`Depósito Asaas ${payment.id}`);

    if (already) {
      return res.json({ ok: true, duplicated: true });
    }

    const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);

    if (!wallet) {
      return res.status(404).json({ ok: false, error: 'Wallet não encontrada' });
    }

    const newBalance = wallet.balance_cents + cents;

    db.transaction(() => {
      db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?')
        .run(newBalance, wallet.id);

      db.prepare(`
        INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        wallet.id,
        'deposit_asaas',
        cents,
        newBalance,
        `Depósito Asaas ${payment.id}`
      );
    })();

    res.json({
      ok: true,
      credited: true,
      userId,
      amount: value,
      balance: newBalance / 100
    });
  } catch (err) {
    console.error('Erro webhook Asaas payment:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;