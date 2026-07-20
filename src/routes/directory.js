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
    const sameCompany =
      Number(target.company_id) ===
        Number(req.user.companyId);
    const notPrivileged =
      !['super_admin', 'admin'].includes(target.role);

    if (req.user.groupId) {
      return sameCompany &&
        notPrivileged &&
        Number(target.group_id) === Number(req.user.groupId);
    }

    return sameCompany && notPrivileged;
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
      u.group_id,
      u.last_login_at,
      u.last_login_ip,
      g.name AS group_name,
      c.name AS company_name,
      c.code AS company_code
    FROM users u
    LEFT JOIN companies c
      ON c.id = u.company_id
    LEFT JOIN responsavel_groups g
      ON g.id = u.group_id
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
    const userGroupId = req.user.groupId;

    let users;

    if (scope === null && !userGroupId) {
      users = db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.group_id,
            u.last_login_at,
            u.last_login_ip,
            u.created_at,
            g.name AS group_name,
            c.name AS company_name,
            c.code AS company_code
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          LEFT JOIN responsavel_groups g
            ON g.id = u.group_id
          ORDER BY c.name, u.name
        `).all();
    } else if (scope !== null && !userGroupId) {
      users = db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.group_id,
            u.last_login_at,
            u.last_login_ip,
            u.created_at,
            g.name AS group_name,
            c.name AS company_name,
            c.code AS company_code
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          LEFT JOIN responsavel_groups g
            ON g.id = u.group_id
          WHERE u.company_id = ?
          ORDER BY u.name
        `).all(scope);
    } else {
      users = db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.active,
            u.company_id,
            u.group_id,
            u.last_login_at,
            u.last_login_ip,
            u.created_at,
            g.name AS group_name,
            c.name AS company_name,
            c.code AS company_code
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          LEFT JOIN responsavel_groups g
            ON g.id = u.group_id
          WHERE u.company_id = ?
            AND u.group_id = ?
          ORDER BY u.name
        `).all(scope, userGroupId);
    }

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

    let groupId = null;

    if (req.user.groupId) {
      groupId = Number(req.user.groupId);
    } else if (req.body.groupId) {
      groupId = Number(req.body.groupId);
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
            group_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          name,
          email,
          hash,
          role,
          companyId,
          groupId || null
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
            role,
            groupId: groupId || null
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

    let groupId = req.body.groupId !== undefined
      ? (Number(req.body.groupId) || null)
      : target.group_id;

    if (!isSuperAdmin(req)) {
      companyId = Number(req.user.companyId);

      if (['super_admin', 'admin'].includes(role)) {
        role = target.role;
      }

      groupId = req.user.groupId || target.group_id;
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
            group_id = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        email,
        role,
        companyId,
        groupId,
        target.id
      );

      audit(req, {
        companyId,
        targetUserId: target.id,
        action: 'USER_UPDATED',
        details: {
          name,
          email,
          role,
          groupId
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

    let logs;

    if (scope === null && !req.user.groupId) {
      logs = db.prepare(`
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
        `).all(limit);
    } else if (scope !== null && !req.user.groupId) {
      logs = db.prepare(`
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
    } else {
      logs = db.prepare(`
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
            AND actor.group_id = ?
          ORDER BY a.id DESC
          LIMIT ?
        `).all(scope, req.user.groupId, limit);
    }

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

/*
 * ─── Grupos / Responsáveis ─────────────────────────────────
 */

router.get('/groups', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode gerenciar grupos.'
    });
  }

  const groups = db.prepare(`
      SELECT
        g.*,
        COUNT(u.id) AS user_count,
        (SELECT COUNT(*) FROM bank_operation_days d WHERE d.group_id = g.id) AS closing_count
      FROM responsavel_groups g
      LEFT JOIN users u ON u.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `).all();

  return res.json({
    ok: true,
    groups: groups.map(g => ({
      ...g,
      active: Boolean(g.active)
    }))
  });
});

router.get('/ungrouped', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode ver usuários sem grupo.'
    });
  }

  const users = db.prepare(`
      SELECT id, name, email, company_id
      FROM users
      WHERE role = 'operator'
        AND group_id IS NULL
      ORDER BY name
    `).all();

  return res.json({ ok: true, users });
});

router.get('/groups/ungrouped', auth, requireManager, (req, res) => {
  const scope = companyScope(req);

  const users = scope === null
    ? db.prepare(`
        SELECT id, name, email, company_id
        FROM users
        WHERE role = 'operator'
          AND group_id IS NULL
        ORDER BY name
      `).all()
    : db.prepare(`
        SELECT id, name, email, company_id
        FROM users
        WHERE role = 'operator'
          AND group_id IS NULL
          AND company_id = ?
        ORDER BY name
      `).all(scope);

  return res.json({ ok: true, users });
});

router.get('/groups/admins', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode gerenciar administradores de grupo.'
    });
  }

  const admins = db.prepare(`
    SELECT id, name, email, company_id
    FROM users
    WHERE role = 'admin'
    ORDER BY name
  `).all();

  return res.json({ ok: true, admins });
});

router.post('/groups', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode criar grupos.'
    });
  }

  const name = String(req.body.name || '').trim();

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: 'Nome do grupo é obrigatório.'
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO responsavel_groups (name)
      VALUES (?)
    `).run(name);

    const groupId = Number(result.lastInsertRowid);

    audit(req, {
      action: 'GROUP_CREATED',
      details: { name }
    });

    return res.status(201).json({
      ok: true,
      groupId
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

router.put('/groups/:id', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode editar grupos.'
    });
  }

  const group = db.prepare(`
    SELECT * FROM responsavel_groups WHERE id = ?
  `).get(Number(req.params.id));

  if (!group) {
    return res.status(404).json({
      ok: false,
      error: 'Grupo não encontrado.'
    });
  }

  const name = String(req.body.name || group.name).trim();
  const adminUserId = req.body.adminUserId
    ? Number(req.body.adminUserId)
    : group.admin_user_id;

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: 'Nome do grupo é obrigatório.'
    });
  }

  if (adminUserId) {
    const admin = db.prepare(`
      SELECT id, role FROM users WHERE id = ? AND role = 'admin'
    `).get(adminUserId);

    if (!admin) {
      return res.status(400).json({
        ok: false,
        error: 'Administrador inválido ou não encontrado.'
      });
    }
  }

  const oldAdminId = group.admin_user_id;

  db.transaction(() => {
    db.prepare(`
      UPDATE responsavel_groups
      SET name = ?,
          admin_user_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, adminUserId || null, group.id);

    if (oldAdminId && Number(oldAdminId) !== Number(adminUserId)) {
      db.prepare(`
        UPDATE users
        SET group_id = NULL,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND group_id = ?
      `).run(oldAdminId, group.id);
    }

    if (adminUserId && Number(adminUserId) !== Number(oldAdminId)) {
      db.prepare(`
        UPDATE users
        SET group_id = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(group.id, adminUserId);
    }
  })();

  if (Number(adminUserId) !== Number(oldAdminId)) {
    if (oldAdminId) {
      audit(req, {
        action: 'GROUP_ADMIN_REMOVED',
        details: {
          groupId: group.id,
          groupName: group.name,
          oldAdminId
        }
      });
    }

    if (adminUserId) {
      audit(req, {
        companyId: null,
        targetUserId: adminUserId,
        action: 'GROUP_ADMIN_ASSIGNED',
        details: {
          groupId: group.id,
          groupName: name
        }
      });
    }
  }

  audit(req, {
    action: 'GROUP_UPDATED',
    details: {
      groupId: group.id,
      oldName: group.name,
      newName: name
    }
  });

  return res.json({ ok: true });
});

router.patch('/groups/:id/toggle', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode ativar/desativar grupos.'
    });
  }

  const group = db.prepare(`
    SELECT * FROM responsavel_groups WHERE id = ?
  `).get(Number(req.params.id));

  if (!group) {
    return res.status(404).json({
      ok: false,
      error: 'Grupo não encontrado.'
    });
  }

  const active = group.active ? 0 : 1;

  db.prepare(`
    UPDATE responsavel_groups
    SET active = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(active, group.id);

  audit(req, {
    action: active ? 'GROUP_ENABLED' : 'GROUP_DISABLED',
    details: {
      groupId: group.id,
      groupName: group.name
    }
  });

  return res.json({
    ok: true,
    active: Boolean(active)
  });
});

router.post('/groups/:id/assign', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode vincular usuários a grupos.'
    });
  }

  const group = db.prepare(`
    SELECT * FROM responsavel_groups WHERE id = ?
  `).get(Number(req.params.id));

  if (!group) {
    return res.status(404).json({
      ok: false,
      error: 'Grupo não encontrado.'
    });
  }

  const userId = Number(req.body.userId);
  const target = db.prepare(`
    SELECT id, name, group_id FROM users WHERE id = ?
  `).get(userId);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: 'Usuário não encontrado.'
    });
  }

  const oldGroupId = target.group_id;
  const oldGroup = oldGroupId
    ? db.prepare(`SELECT name FROM responsavel_groups WHERE id = ?`).get(oldGroupId)
    : null;

  db.prepare(`
    UPDATE users
    SET group_id = ?,
        session_version = session_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(group.id, target.id);

  audit(req, {
    companyId: null,
    targetUserId: target.id,
    action: 'USER_GROUP_ASSIGNED',
    details: {
      userId: target.id,
      userName: target.name,
      oldGroupId,
      oldGroupName: oldGroup?.name || null,
      newGroupId: group.id,
      newGroupName: group.name
    }
  });

  return res.json({ ok: true });
});

router.get('/groups/:id/members', auth, requireManager, (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o Super Admin pode ver membros de grupos.'
    });
  }

  const groupId = Number(req.params.id);

  const group = db.prepare(`
    SELECT * FROM responsavel_groups WHERE id = ?
  `).get(groupId);

  if (!group) {
    return res.status(404).json({
      ok: false,
      error: 'Grupo não encontrado.'
    });
  }

  const members = db.prepare(`
      SELECT id, name, email, company_id, role,
             (SELECT name FROM companies WHERE id = u.company_id) AS company_name
      FROM users u
      WHERE group_id = ?
      ORDER BY name
    `).all(groupId);

  return res.json({ ok: true, members });
});

module.exports = router;
