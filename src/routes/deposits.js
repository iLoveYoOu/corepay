const express = require('express');
const crypto = require('crypto');
const auth = require('../middlewares/auth');
const db = require('../db/database');
const mercadoPago = require('../providers/mercadopago');

const router = express.Router();

function parseAmount(value) {
  let text = String(value ?? '').trim();

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(',', '.');
  }

  const amount = Number(text);

  return Number.isFinite(amount) ? amount : 0;
}

function getWallet(userId) {
  return db.prepare(`
    SELECT *
    FROM wallets
    WHERE user_id = ?
  `).get(userId);
}

function validateApprovedPayment(payment, deposit) {
  const amountCents = Math.round(
    Number(payment.transaction_amount) * 100
  );
  const currency = String(payment.currency_id || 'BRL');
  const reference = String(payment.external_reference || '');

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents !== deposit.amount_cents ||
    currency !== 'BRL' ||
    reference !== deposit.external_reference
  ) {
    throw new Error(
      'Pagamento aprovado não corresponde ao depósito solicitado.'
    );
  }
}

function creditApprovedDeposit(payment) {
  const paymentId = String(payment.id || '');

  if (!paymentId) {
    throw new Error('Pagamento sem ID.');
  }

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

  const status = String(payment.status || '');
  const statusDetail =
    String(payment.status_detail || '');

  db.prepare(`
    UPDATE mp_deposits
    SET status = ?,
        status_detail = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, statusDetail, deposit.id);

  if (!mercadoPago.isApproved(payment)) {
    return {
      found: true,
      credited: Boolean(deposit.credited),
      status,
      statusDetail
    };
  }

  validateApprovedPayment(payment, deposit);

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
    `).run(statusDetail, current.id);

    return true;
  });

  return {
    found: true,
    credited: transaction(),
    status: 'approved',
    statusDetail
  };
}

router.post('/mercadopago/pix', auth, async (req, res) => {
  try {
    if (process.env.ENABLE_MERCADOPAGO_DEPOSITS !== 'true') {
      return res.status(410).json({
        ok: false,
        code: 'MERCADOPAGO_DEPOSITS_DISABLED',
        error:
          'Depósitos pelo Mercado Pago estão desativados. Use o Pix estático da Operação de Créditos.'
      });
    }

    const amount = parseAmount(req.body.amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Informe um valor válido.'
      });
    }

    const wallet = getWallet(req.user.id);

    if (!wallet) {
      return res.status(404).json({
        ok: false,
        error: 'Carteira não encontrada.'
      });
    }

    const amountCents = Math.round(amount * 100);

    const externalReference =
      `corepay_${req.user.id}_${Date.now()}_${crypto
        .randomBytes(4)
        .toString('hex')}`;

    const pix = await mercadoPago.createPix({
      amount,
      description:
        `Crédito CorePay - usuário ${req.user.id}`,
      externalReference
    });

    db.prepare(`
      INSERT INTO mp_deposits (
        payment_id,
        user_id,
        wallet_id,
        amount_cents,
        status,
        status_detail,
        external_reference
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pix.id,
      req.user.id,
      wallet.id,
      amountCents,
      pix.status || 'pending',
      pix.statusDetail || null,
      externalReference
    );

    return res.status(201).json({
      ok: true,
      provider: 'mercadopago',
      paymentId: pix.id,
      value: amount,
      payload: pix.payload,
      encodedImage: pix.encodedImage,
      status: pix.status,
      expirationDate: pix.expirationDate
    });
  } catch (err) {
    console.error(
      'Erro Mercado Pago:',
      err.data || err
    );

    return res.status(err.status || 500).json({
      ok: false,
      error:
        err.data?.message ||
        err.message ||
        'Erro ao gerar Pix Mercado Pago.'
    });
  }
});

router.get(
  '/mercadopago/:paymentId/status',
  auth,
  async (req, res) => {
    try {
      const paymentId =
        String(req.params.paymentId || '');

      const deposit = db.prepare(`
        SELECT *
        FROM mp_deposits
        WHERE payment_id = ?
          AND user_id = ?
      `).get(paymentId, req.user.id);

      if (!deposit) {
        return res.status(404).json({
          ok: false,
          error: 'Depósito não encontrado.'
        });
      }

      const payment =
        await mercadoPago.getPayment(paymentId);

      const result =
        creditApprovedDeposit(payment);

      return res.json({
        ok: true,
        paymentId,
        status: payment.status,
        statusDetail: payment.status_detail,
        approved:
          mercadoPago.isApproved(payment),
        credited:
          Boolean(
            result.credited ||
            db.prepare(`
              SELECT credited
              FROM mp_deposits
              WHERE payment_id = ?
            `).get(paymentId)?.credited
          )
      });
    } catch (err) {
      console.error(
        'Erro ao consultar Mercado Pago:',
        err.data || err
      );

      return res.status(err.status || 500).json({
        ok: false,
        error: err.message
      });
    }
  }
);

router.creditApprovedDeposit =
  creditApprovedDeposit;

module.exports = router;
