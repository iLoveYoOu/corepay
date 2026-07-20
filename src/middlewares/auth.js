const jwt = require('jsonwebtoken');
const db = require('../db/database');

const VALID_ROLES = new Set([
  'super_admin',
  'admin',
  'operator'
]);

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token ausente' });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = db.prepare(`
      SELECT
        u.id,
        u.role,
        u.active,
        u.company_id,
        u.session_version,
        u.group_id,
        c.active AS company_active,
        g.name AS group_name
      FROM users u
      LEFT JOIN companies c
        ON c.id = u.company_id
      LEFT JOIN responsavel_groups g
        ON g.id = u.group_id AND g.active = 1
      WHERE u.id = ?
    `).get(payload.id);

    if (!user || !user.active) {
      return res.status(401).json({
        ok: false,
        error: 'Sessão inválida ou usuário inativo'
      });
    }

    if (!VALID_ROLES.has(user.role)) {
      return res.status(403).json({
        ok: false,
        error: 'Perfil de acesso inválido'
      });
    }

    const tokenCompanyId = payload.companyId == null
      ? null
      : Number(payload.companyId);

    const currentCompanyId = user.company_id == null
      ? null
      : Number(user.company_id);

    const sessionChanged =
      Number(payload.sessionVersion) !==
        Number(user.session_version);

    const identityChanged =
      payload.role !== user.role ||
      tokenCompanyId !== currentCompanyId;

    if (sessionChanged || identityChanged) {
      return res.status(401).json({
        ok: false,
        error: 'Sessão expirada. Entre novamente.'
      });
    }

    if (
      user.role !== 'super_admin' &&
      !user.company_active
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Empresa inativa.'
      });
    }

    req.user = {
      id: user.id,
      role: user.role,
      companyId: currentCompanyId,
      sessionVersion: Number(user.session_version),
      groupId: user.group_id,
      groupName: user.group_name
    };

    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

module.exports = auth;
