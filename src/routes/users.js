const express = require('express');
const bcrypt = require('bcryptjs');
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

function isSuperAdmin(req) {
  return req.user.role === 'super_admin';
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

function getTarget(req, userId) {
  const target = db.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
      AND role = 'operator'
  `).get(Number(userId));

  if (!target) return null;

  if (!isSuperAdmin(req)) {
    if (Number(target.company_id) !== Number(req.user.companyId)) {
      return null;
    }

    if (req.user.groupId && Number(target.group_id) !== Number(req.user.groupId)) {
      return null;
    }
  }

  return target;
}

function getWallet(userId) {
  return db.prepare(`
    SELECT *
    FROM wallets
    WHERE user_id = ?
  `).get(Number(userId));
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

router.post('/', auth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const companyId = isSuperAdmin(req)
    ? Number(req.body.companyId || req.user.companyId)
    : Number(req.user.companyId);

  if (!name || !email || password.length < 8) {
    return res.status(400).json({
      ok: false,
      error: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.'
    });
  }

  const company = db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ? AND active = 1
  `).get(companyId);

  if (!company) {
    return res.status(400).json({
      ok: false,
      error: 'Empresa inválida ou inativa.'
    });
  }

  const exists = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
  `).get(email);

  if (exists) {
    return res.status(400).json({
      ok: false,
      error: 'E-mail já cadastrado.'
    });
  }

  const groupId = req.user.groupId || null;

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO users (
          name,
          email,
          password_hash,
          role,
          active,
          company_id,
          group_id,
          updated_at
        )
        VALUES (?, ?, ?, 'operator', 1, ?, ?, CURRENT_TIMESTAMP)
      `).run(name, email, passwordHash, companyId, groupId);

      const userId = Number(result.lastInsertRowid);

      db.prepare(`
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
      `).run(userId);

      const target = {
        id: userId,
        company_id: companyId
      };

      audit(req, target, 'USER_CREATED', {
        name,
        email,
        role: 'operator',
        groupId
      });

      return userId;
    });

    return res.status(201).json({
      ok: true,
      user_id: create()
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.code === 'SQLITE_CONSTRAINT_UNIQUE'
        ? 'E-mail já cadastrado.'
        : error.message
    });
  }
});

router.get('/', auth, requireAdmin, (req, res) => {
  const isGroupAdmin = !isSuperAdmin(req) && req.user.groupId;

  const users = isSuperAdmin(req)
    ? db.prepare(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.active,
          u.company_id,
          u.group_id,
          COALESCE(w.balance_cents, 0) AS balance_cents
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.role = 'operator'
        ORDER BY u.id DESC
      `).all()
    : isGroupAdmin
      ? db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.group_id,
            COALESCE(w.balance_cents, 0) AS balance_cents
          FROM users u
          LEFT JOIN wallets w ON w.user_id = u.id
          WHERE u.role = 'operator'
            AND u.company_id = ?
            AND u.group_id = ?
          ORDER BY u.id DESC
        `).all(req.user.companyId, req.user.groupId)
      : db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.group_id,
            COALESCE(w.balance_cents, 0) AS balance_cents
          FROM users u
          LEFT JOIN wallets w ON w.user_id = u.id
          WHERE u.role = 'operator'
            AND u.company_id = ?
          ORDER BY u.id DESC
        `).all(req.user.companyId);

  return res.json({
    ok: true,
    users: users.map(user => ({
      ...user,
      active: Boolean(user.active),
      balance: user.balance_cents / 100
    }))
  });
});

router.put('/:id', auth, requireAdmin, (req, res) => {
  const target = getTarget(req, req.params.id);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: 'Operador não encontrado.'
    });
  }

  const name = String(req.body.name || target.name).trim();
  const email = String(req.body.email || target.email)
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !email || (password && password.length < 8)) {
    return res.status(400).json({
      ok: false,
      error: 'Confira nome, e-mail e senha de pelo menos 8 caracteres.'
    });
  }

  try {
    const passwordHash = password
      ? bcrypt.hashSync(password, 10)
      : target.password_hash;

    db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET name = ?,
            email = ?,
            password_hash = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, email, passwordHash, target.id);

      audit(req, target, 'USER_UPDATED', {
        name,
        email,
        passwordChanged: Boolean(password)
      });
    })();

    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.code === 'SQLITE_CONSTRAINT_UNIQUE'
        ? 'E-mail já cadastrado.'
        : error.message
    });
  }
});

router.patch('/:id/toggle', auth, requireAdmin, (req, res) => {
  const target = getTarget(req, req.params.id);

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
});

router.delete('/:id', auth, requireAdmin, (req, res) => {
  const target = getTarget(req, req.params.id);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: 'Operador não encontrado.'
    });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET active = 0,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(target.id);

    audit(req, target, 'USER_DISABLED');
  })();

  return res.json({ ok: true });
});

router.post('/:id/balance', auth, requireAdmin, (req, res) => {
  const target = getTarget(req, req.params.id);
  const cents = parseCents(req.body.amount);
  const type = String(req.body.type || '');

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: 'Operador não encontrado.'
    });
  }

  if (!cents || !['credit', 'debit'].includes(type)) {
    return res.status(400).json({
      ok: false,
      error: 'Valor ou tipo inválido.'
    });
  }

  try {
    const updateBalance = db.transaction(() => {
      const wallet = getWallet(target.id);

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
          (type === 'debit' ? 'Retirada administrativa' : 'Crédito administrativo')
      );

      audit(req, target, type === 'debit' ? 'WALLET_DEBITED' : 'WALLET_CREDITED', {
        amountCents: cents
      });

      return nextBalance;
    });

    return res.json({
      ok: true,
      balance: updateBalance() / 100
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
