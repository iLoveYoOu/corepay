const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({
      ok: false,
      error: 'Acesso restrito à administração.'
    });
  }

  return next();
}

function getTarget(req, userId) {
  const target = db.prepare(`
    SELECT *
    FROM users
    WHERE id = ? AND role = 'operator'
  `).get(Number(userId));

  if (!target) return null;

  if (
    req.user.role !== 'super_admin' &&
    Number(target.company_id) !== Number(req.user.companyId)
  ) {
    return null;
  }

  return target;
}

function parseCents(value) {
  let text = String(value ?? '').trim();

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(',', '.');
  }

  const number = Number(text);
  const cents = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0
  ) {
    return null;
  }

  return cents;
}

function audit(req, target, action, details = null) {
  db.prepare(`
    INSERT INTO audit_logs (
      company_id,
      actor_user_id,
      target_user_id,
      action,
      details,
      ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    target.company_id,
    req.user.id,
    target.id,
    action,
    details ? JSON.stringify(details) : null,
    req.ip || null
  );
}

function changeBalance(req, res, type) {
  const target = getTarget(req, req.params.userId);
  const cents = parseCents(req.body.amount);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: 'Operador não encontrado.'
    });
  }

  if (!cents) {
    return res.status(400).json({
      ok: false,
      error: 'Valor inválido.'
    });
  }

  try {
    const execute = db.transaction(() => {
      const wallet = db.prepare(`
        SELECT *
        FROM wallets
        WHERE user_id = ?
      `).get(target.id);

      if (!wallet) {
        throw new Error('Carteira não encontrada.');
      }

      const delta = type === 'debit' ? -cents : cents;
      const nextBalance = wallet.balance_cents + delta;

      if (nextBalance < 0) {
        throw new Error('Saldo insuficiente.');
      }

      db.prepare(`
        UPDATE wallets
        SET balance_cents = ?
        WHERE id = ?
      `).run(nextBalance, wallet.id);

      db.prepare(`
        INSERT INTO ledger (
          wallet_id,
          type,
          amount_cents,
          balance_after_cents,
          description
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        wallet.id,
        type === 'debit' ? 'admin_debit' : 'admin_credit',
        delta,
        nextBalance,
        String(req.body.description || '').trim() ||
          (type === 'debit' ? 'Débito administrativo' : 'Crédito administrativo')
      );

      audit(
        req,
        target,
        type === 'debit' ? 'WALLET_DEBITED' : 'WALLET_CREDITED',
        { amountCents: cents }
      );

      return nextBalance;
    });

    return res.json({
      ok: true,
      balance: execute() / 100
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
}

router.post(
  '/wallets/:userId/credit',
  auth,
  requireAdmin,
  (req, res) => changeBalance(req, res, 'credit')
);

router.post(
  '/wallets/:userId/debit',
  auth,
  requireAdmin,
  (req, res) => changeBalance(req, res, 'debit')
);

router.post(
  '/users/:userId/toggle',
  auth,
  requireAdmin,
  (req, res) => {
    const target = getTarget(req, req.params.userId);

    if (!target) {
      return res.status(404).json({
        ok: false,
        error: 'Operador não encontrado.'
      });
    }

    const active = target.active ? 0 : 1;

    db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET active = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(active, target.id);

      audit(
        req,
        target,
        active ? 'USER_ENABLED' : 'USER_DISABLED'
      );
    })();

    return res.json({
      ok: true,
      active: Boolean(active)
    });
  }
);

module.exports = router;
