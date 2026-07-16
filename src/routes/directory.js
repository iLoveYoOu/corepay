const express = require('express');
const bcrypt = require('bcryptjs');
const auth = require('../middlewares/auth');
const db = require('../db/database');

const router = express.Router();

const ROLES = [
  'super_admin',
  'admin',
  'operator'
];

function isSuperAdmin(req) {
  return req.user.role === 'super_admin';
}

function isManager(req) {
  return (
    req.user.role === 'super_admin' ||
    req.user.role === 'admin'
  );
}

function requireManager(req, res, next) {
  if (!isManager(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Acesso restrito à administração.'
    });
  }

  next();
}

function audit(req, {
  companyId = null,
  targetUserId = null,
  action,
  details = null
}) {
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
    companyId,
    req.user.id,
    targetUserId,
    action,
    details ? JSON.stringify(details) : null,
    req.ip || null
  );
}

function companyScope(req) {
  if (isSuperAdmin(req)) {
    return null;
  }

  return Number(req.user.companyId);
}

function canManageTarget(req, target) {
  if (!target) return false;

  if (isSuperAdmin(req)) {
    return target.id !== req.user.id;
  }

  if (req.user.role === 'admin') {
    return (
      Number(target.company_id) ===
        Number(req.user.companyId) &&
      !['super_admin', 'admin'].includes(target.role)
    );
  }

  return false;
}

router.get('/me', auth, (req, res) => {
  const user = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.active,
      u.company_id,
      u.last_login_at,
      c.name AS company_name,
      c.code AS company_code
    FROM users u
    LEFT JOIN companies c
      ON c.id = u.company_id
    WHERE u.id = ?
  `).get(req.user.id);

  return res.json({
    ok: true,
    user,
    permissions: {
      globalAccess: user.role === 'super_admin',
      manageCompanies: user.role === 'super_admin',
      manageAdmins: user.role === 'super_admin',
      manageUsers: [
        'super_admin',
        'admin'
      ].includes(user.role),
      viewTreasury: [
        'super_admin',
        'admin'
      ].includes(user.role)
    }
  });
});

router.get(
  '/companies',
  auth,
  requireManager,
  (req, res) => {
    const companies = isSuperAdmin(req)
      ? db.prepare(`
          SELECT
            c.*,
            COUNT(u.id) AS user_count
          FROM companies c
          LEFT JOIN users u
            ON u.company_id = c.id
          GROUP BY c.id
          ORDER BY c.name
        `).all()
      : db.prepare(`
          SELECT
            c.*,
            COUNT(u.id) AS user_count
          FROM companies c
          LEFT JOIN users u
            ON u.company_id = c.id
          WHERE c.id = ?
          GROUP BY c.id
        `).all(req.user.companyId);

    return res.json({
      ok: true,
      companies: companies.map(item => ({
        ...item,
        active: Boolean(item.active)
      }))
    });
  }
);

router.post(
  '/companies',
  auth,
  requireManager,
  (req, res) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        ok: false,
        error: 'Somente o Super Admin pode criar empresas.'
      });
    }

    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    if (!name || !code) {
      return res.status(400).json({
        ok: false,
        error: 'Informe nome e código da empresa.'
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO companies (name, code)
        VALUES (?, ?)
      `).run(name, code);

      const companyId =
        Number(result.lastInsertRowid);

      audit(req, {
        companyId,
        action: 'COMPANY_CREATED',
        details: { name, code }
      });

      return res.status(201).json({
        ok: true,
        companyId
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error:
          err.code === 'SQLITE_CONSTRAINT_UNIQUE'
            ? 'Código de empresa já utilizado.'
            : err.message
      });
    }
  }
);

router.patch(
  '/companies/:id/toggle',
  auth,
  requireManager,
  (req, res) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        ok: false,
        error: 'Somente o Super Admin pode alterar empresas.'
      });
    }

    const company = db.prepare(`
      SELECT *
      FROM companies
      WHERE id = ?
    `).get(Number(req.params.id));

    if (!company) {
      return res.status(404).json({
        ok: false,
        error: 'Empresa não encontrada.'
      });
    }

    const active = company.active ? 0 : 1;

    db.prepare(`
      UPDATE companies
      SET active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(active, company.id);

    db.prepare(`
      UPDATE users
      SET session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
    `).run(company.id);

    audit(req, {
      companyId: company.id,
      action: active
        ? 'COMPANY_ENABLED'
        : 'COMPANY_DISABLED'
    });

    return res.json({
      ok: true,
      active: Boolean(active)
    });
  }
);

router.get(
  '/users',
  auth,
  requireManager,
  (req, res) => {
    const scope = companyScope(req);

    const users = scope === null
      ? db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.last_login_at,
            u.created_at,
            c.name AS company_name,
            c.code AS company_code
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          ORDER BY c.name, u.name
        `).all()
      : db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.last_login_at,
            u.created_at,
            c.name AS company_name,
            c.code AS company_code
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          WHERE u.company_id = ?
          ORDER BY u.name
        `).all(scope);

    return res.json({
      ok: true,
      users: users.map(user => ({
        ...user,
        active: Boolean(user.active)
      }))
    });
  }
);

router.post(
  '/users',
  auth,
  requireManager,
  (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'operator');
    const requestedCompanyId =
      Number(req.body.companyId);

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        ok: false,
        error:
          'Informe nome, e-mail e senha com pelo menos 8 caracteres.'
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        ok: false,
        error: 'Perfil inválido.'
      });
    }

    let companyId;

    if (isSuperAdmin(req)) {
      companyId = requestedCompanyId;

      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Selecione a empresa.'
        });
      }
    } else {
      companyId = Number(req.user.companyId);

      if (['super_admin', 'admin'].includes(role)) {
        return res.status(403).json({
          ok: false,
          error:
            'O administrador da empresa não pode criar outro administrador.'
        });
      }
    }

    const company = db.prepare(`
      SELECT *
      FROM companies
      WHERE id = ? AND active = 1
    `).get(companyId);

    if (!company) {
      return res.status(400).json({
        ok: false,
        error: 'Empresa inválida ou inativa.'
      });
    }

    try {
      const hash = bcrypt.hashSync(password, 10);

      const createUser = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO users (
            name,
            email,
            password_hash,
            role,
            active,
            company_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
        `).run(
          name,
          email,
          hash,
          role,
          companyId
        );

        const userId = Number(result.lastInsertRowid);

        db.prepare(`
          INSERT INTO wallets (user_id, balance_cents)
          VALUES (?, 0)
        `).run(userId);

        audit(req, {
          companyId,
          targetUserId: userId,
          action: 'USER_CREATED',
          details: {
            name,
            email,
            role
          }
        });

        return userId;
      });

      const userId = createUser();

      return res.status(201).json({
        ok: true,
        userId
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error:
          err.code === 'SQLITE_CONSTRAINT_UNIQUE'
            ? 'Este e-mail já está cadastrado.'
            : err.message
      });
    }
  }
);

router.patch(
  '/users/:id',
  auth,
  requireManager,
  (req, res) => {
    const target = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
    `).get(Number(req.params.id));

    if (!canManageTarget(req, target)) {
      return res.status(403).json({
        ok: false,
        error: 'Você não pode alterar este usuário.'
      });
    }

    const name = String(
      req.body.name || target.name
    ).trim();

    const email = String(
      req.body.email || target.email
    ).trim().toLowerCase();

    let role = String(
      req.body.role || target.role
    );

    let companyId = Number(
      req.body.companyId || target.company_id
    );

    if (!isSuperAdmin(req)) {
      companyId = Number(req.user.companyId);

      if (['super_admin', 'admin'].includes(role)) {
        role = target.role;
      }
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        ok: false,
        error: 'Perfil inválido.'
      });
    }

    try {
      db.prepare(`
        UPDATE users
        SET name = ?,
            email = ?,
            role = ?,
            company_id = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        email,
        role,
        companyId,
        target.id
      );

      audit(req, {
        companyId,
        targetUserId: target.id,
        action: 'USER_UPDATED',
        details: {
          name,
          email,
          role
        }
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error:
          err.code === 'SQLITE_CONSTRAINT_UNIQUE'
            ? 'Este e-mail já está cadastrado.'
            : err.message
      });
    }
  }
);

router.post(
  '/users/:id/reset-password',
  auth,
  requireManager,
  (req, res) => {
    const target = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
    `).get(Number(req.params.id));

    if (!canManageTarget(req, target)) {
      return res.status(403).json({
        ok: false,
        error: 'Você não pode redefinir este usuário.'
      });
    }

    const password = String(
      req.body.password || ''
    );

    if (password.length < 8) {
      return res.status(400).json({
        ok: false,
        error:
          'A nova senha deve ter pelo menos 8 caracteres.'
      });
    }

    const hash = bcrypt.hashSync(password, 10);

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hash, target.id);

    audit(req, {
      companyId: target.company_id,
      targetUserId: target.id,
      action: 'PASSWORD_RESET'
    });

    return res.json({ ok: true });
  }
);

router.patch(
  '/users/:id/toggle',
  auth,
  requireManager,
  (req, res) => {
    const target = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
    `).get(Number(req.params.id));

    if (!canManageTarget(req, target)) {
      return res.status(403).json({
        ok: false,
        error: 'Você não pode bloquear este usuário.'
      });
    }

    const active = target.active ? 0 : 1;

    db.prepare(`
      UPDATE users
      SET active = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(active, target.id);

    audit(req, {
      companyId: target.company_id,
      targetUserId: target.id,
      action: active
        ? 'USER_ENABLED'
        : 'USER_DISABLED'
    });

    return res.json({
      ok: true,
      active: Boolean(active)
    });
  }
);

router.get(
  '/audit',
  auth,
  requireManager,
  (req, res) => {
    const scope = companyScope(req);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    const logs = scope === null
      ? db.prepare(`
          SELECT
            a.*,
            actor.name AS actor_name,
            target.name AS target_name,
            c.name AS company_name
          FROM audit_logs a
          LEFT JOIN users actor
            ON actor.id = a.actor_user_id
          LEFT JOIN users target
            ON target.id = a.target_user_id
          LEFT JOIN companies c
            ON c.id = a.company_id
          ORDER BY a.id DESC
          LIMIT ?
        `).all(limit)
      : db.prepare(`
          SELECT
            a.*,
            actor.name AS actor_name,
            target.name AS target_name,
            c.name AS company_name
          FROM audit_logs a
          LEFT JOIN users actor
            ON actor.id = a.actor_user_id
          LEFT JOIN users target
            ON target.id = a.target_user_id
          LEFT JOIN companies c
            ON c.id = a.company_id
          WHERE a.company_id = ?
          ORDER BY a.id DESC
          LIMIT ?
        `).all(scope, limit);

    return res.json({
      ok: true,
      logs: logs.map(log => ({
        ...log,
        details: (() => {
          if (!log.details) return null;

          try {
            return JSON.parse(log.details);
          } catch {
            return { raw: log.details };
          }
        })()
      }))
    });
  }
);

module.exports = router;
