const express = require('express');
const db = require('../db/database');
const mercadoPago = require('../providers/mercadopago');

const router = express.Router();

function creditPayment(payment) {
  const paymentId = String(payment.id || '');

  const deposit = db.prepare(`
    SELECT *
    FROM mp_deposits
    WHERE payment_id = ?
  `).get(paymentId);

  if (!deposit) {
    return {
      found: false,
      credited: false
    };
  }

  db.prepare(`
    UPDATE mp_deposits
    SET status = ?,
        status_detail = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(payment.status || ''),
    String(payment.status_detail || ''),
    deposit.id
  );

  if (!mercadoPago.isApproved(payment)) {
    return {
      found: true,
      credited: Boolean(deposit.credited)
    };
  }

  const transaction = db.transaction(() => {
    const current = db.prepare(`
      SELECT *
      FROM mp_deposits
      WHERE id = ?
    `).get(deposit.id);

    if (current.credited) {
      return false;
    }

    const wallet = db.prepare(`
      SELECT *
      FROM wallets
      WHERE id = ?
    `).get(current.wallet_id);

    if (!wallet) {
      throw new Error('Carteira não encontrada.');
    }

    const newBalance =
      wallet.balance_cents + current.amount_cents;

    db.prepare(`
      UPDATE wallets
      SET balance_cents = ?
      WHERE id = ?
    `).run(newBalance, wallet.id);

    db.prepare(`
      INSERT INTO ledger (
        wallet_id,
        type,
        amount_cents,
        balance_after_cents,
        description
      )
      VALUES (?, 'deposit', ?, ?, ?)
    `).run(
      wallet.id,
      current.amount_cents,
      newBalance,
      `Depósito Pix Mercado Pago #${paymentId}`
    );

    db.prepare(`
      UPDATE mp_deposits
      SET status = 'approved',
          status_detail = ?,
          credited = 1,
          credited_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      String(payment.status_detail || ''),
      current.id
    );

    return true;
  });

  return {
    found: true,
    credited: transaction()
  };
}

router.post('/', async (req, res) => {
  /*
   * O Mercado Pago pode enviar o ID em formatos diferentes,
   * dependendo da configuração da notificação.
   */
  const paymentId =
    req.body?.data?.id ||
    req.body?.id ||
    req.query?.['data.id'] ||
    req.query?.id ||
    '';

  /*
   * Responde rapidamente mesmo se não for uma
   * notificação de pagamento conhecida.
   */
  if (!paymentId) {
    return res.sendStatus(200);
  }

  try {
    const payment =
      await mercadoPago.getPayment(paymentId);

    const result = creditPayment(payment);

    console.log(
      '[MP WEBHOOK]',
      paymentId,
      payment.status,
      result
    );
  } catch (err) {
    console.error(
      '[MP WEBHOOK]',
      err.data || err.message
    );
  }

  return res.sendStatus(200);
});

module.exports = router;
