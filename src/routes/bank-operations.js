const express = require('express');
const auth = require('../middlewares/auth');
const db = require('../db/database');

const router = express.Router();

db.exec(`
CREATE TABLE IF NOT EXISTS bank_operation_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  operation_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opening_total_cents INTEGER NOT NULL DEFAULT 0,
  closing_total_cents INTEGER,
  profit_total_cents INTEGER NOT NULL DEFAULT 0,
  operator_share_cents INTEGER NOT NULL DEFAULT 0,
  capital_replacement_cents INTEGER NOT NULL DEFAULT 0,
  adjustments_cents INTEGER NOT NULL DEFAULT 0,
  amount_to_send_cents INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  UNIQUE(user_id, operation_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bank_operation_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'both',
  pix_key TEXT,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES bank_operation_days(id)
);

CREATE TABLE IF NOT EXISTS bank_operation_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES bank_operation_days(id),
  FOREIGN KEY (account_id) REFERENCES bank_operation_accounts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_days_user
ON bank_operation_days(user_id, operation_date);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_day
ON bank_operation_accounts(day_id);

CREATE INDEX IF NOT EXISTS idx_bank_movements_day
ON bank_operation_movements(day_id, created_at);
`);

function operationDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function toCents(value, allowNegative = false) {
  let text = String(value ?? '').trim();

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(',', '.');
  }

  const number = Number(text);

  if (!Number.isFinite(number)) return null;
  if (!allowNegative && number < 0) return null;

  return Math.round(number * 100);
}

function money(cents) {
  return Number(cents || 0) / 100;
}

function ownedDay(req, id) {
  return db.prepare(`
    SELECT *
    FROM bank_operation_days
    WHERE id = ? AND user_id = ?
  `).get(Number(id), req.user.id);
}

function serialize(req, day) {
  if (!day) {
    return {
      ok: true,
      operationDate: operationDate(),
      day: null,
      accounts: [],
      movements: [],
      totals: {
        opening: 0,
        current: 0,
        entries: 0,
        exits: 0
      }
    };
  }

  const accounts = db.prepare(`
    SELECT *
    FROM bank_operation_accounts
    WHERE day_id = ? AND active = 1
    ORDER BY name
  `).all(day.id);

  const movements = db.prepare(`
    SELECT
      m.*,
      a.name AS account_name
    FROM bank_operation_movements m
    JOIN bank_operation_accounts a
      ON a.id = m.account_id
    WHERE m.day_id = ?
    ORDER BY m.id DESC
    LIMIT 300
  `).all(day.id);

  const current = accounts.reduce(
    (sum, account) => sum + account.current_balance_cents,
    0
  );

  const entries = movements
    .filter(item => item.type === 'entry')
    .reduce((sum, item) => sum + item.amount_cents, 0);

  const exits = movements
    .filter(item => item.type === 'exit')
    .reduce((sum, item) => sum + item.amount_cents, 0);

  return {
    ok: true,
    operationDate: day.operation_date,
    day: {
      ...day,
      openingTotal: money(day.opening_total_cents),
      closingTotal:
        day.closing_total_cents == null
          ? null
          : money(day.closing_total_cents),
      profitTotal: money(day.profit_total_cents),
      operatorShare: money(day.operator_share_cents),
      capitalReplacement: money(day.capital_replacement_cents),
      adjustments: money(day.adjustments_cents),
      amountToSend: money(day.amount_to_send_cents)
    },
    accounts: accounts.map(account => ({
      ...account,
      openingBalance: money(account.opening_balance_cents),
      currentBalance: money(account.current_balance_cents)
    })),
    movements: movements.map(item => ({
      ...item,
      amount: money(item.amount_cents)
    })),
    totals: {
      opening: money(day.opening_total_cents),
      current: money(current),
      entries: money(entries),
      exits: money(exits)
    }
  };
}

router.get('/today', auth, (req, res) => {
  const day = db.prepare(`
    SELECT *
    FROM bank_operation_days
    WHERE user_id = ? AND operation_date = ?
  `).get(req.user.id, operationDate());

  return res.json(serialize(req, day));
});

router.post('/open', auth, (req, res) => {
  const accounts = Array.isArray(req.body.accounts)
    ? req.body.accounts
    : [];

  if (!accounts.length) {
    return res.status(400).json({
      ok: false,
      error: 'Cadastre pelo menos um banco para iniciar o dia.'
    });
  }

  const normalized = [];

  for (const account of accounts) {
    const name = String(account.name || '').trim();
    const purpose = String(account.purpose || 'both');
    const opening = toCents(account.openingBalance);

    if (
      !name ||
      !['pay', 'receive', 'both'].includes(purpose) ||
      opening == null
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Confira nome, finalidade e saldo inicial dos bancos.'
      });
    }

    normalized.push({
      name,
      purpose,
      pixKey: String(account.pixKey || '').trim(),
      opening
    });
  }

  const date = operationDate();

  const existing = db.prepare(`
    SELECT id
    FROM bank_operation_days
    WHERE user_id = ? AND operation_date = ?
  `).get(req.user.id, date);

  if (existing) {
    return res.status(409).json({
      ok: false,
      error: 'O dia operacional de hoje já foi iniciado.'
    });
  }

  const transaction = db.transaction(() => {
    const openingTotal = normalized.reduce(
      (sum, account) => sum + account.opening,
      0
    );

    const result = db.prepare(`
      INSERT INTO bank_operation_days (
        user_id,
        company_id,
        operation_date,
        opening_total_cents
      )
      VALUES (?, ?, ?, ?)
    `).run(
      req.user.id,
      req.user.companyId || null,
      date,
      openingTotal
    );

    const dayId = Number(result.lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO bank_operation_accounts (
        day_id,
        name,
        purpose,
        pix_key,
        opening_balance_cents,
        current_balance_cents
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const account of normalized) {
      insert.run(
        dayId,
        account.name,
        account.purpose,
        account.pixKey || null,
        account.opening,
        account.opening
      );
    }

    return dayId;
  });

  const dayId = transaction();

  return res.status(201).json(
    serialize(req, ownedDay(req, dayId))
  );
});

router.post('/days/:dayId/accounts', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const name = String(req.body.name || '').trim();
  const purpose = String(req.body.purpose || 'both');
  const pixKey = String(req.body.pixKey || '').trim();
  const opening = toCents(req.body.openingBalance);

  if (
    !name ||
    !['pay', 'receive', 'both'].includes(purpose) ||
    opening == null
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Dados do banco inválidos.'
    });
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO bank_operation_accounts (
        day_id,
        name,
        purpose,
        pix_key,
        opening_balance_cents,
        current_balance_cents
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(day.id, name, purpose, pixKey || null, opening, opening);

    db.prepare(`
      UPDATE bank_operation_days
      SET opening_total_cents = opening_total_cents + ?
      WHERE id = ?
    `).run(opening, day.id);
  })();

  return res.status(201).json(
    serialize(req, ownedDay(req, day.id))
  );
});

router.post('/days/:dayId/movements', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const account = db.prepare(`
    SELECT *
    FROM bank_operation_accounts
    WHERE id = ? AND day_id = ? AND active = 1
  `).get(Number(req.body.accountId), day.id);

  const type = String(req.body.type || '');
  const amount = toCents(req.body.amount);
  const note = String(req.body.note || '').trim();

  if (
    !account ||
    !['entry', 'exit'].includes(type) ||
    !amount ||
    amount <= 0
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Movimentação inválida.'
    });
  }

  const delta = type === 'entry' ? amount : -amount;
  const nextBalance = account.current_balance_cents + delta;

  if (nextBalance < 0) {
    return res.status(400).json({
      ok: false,
      error: 'O saldo do banco não pode ficar negativo.'
    });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE bank_operation_accounts
      SET current_balance_cents = ?
      WHERE id = ?
    `).run(nextBalance, account.id);

    db.prepare(`
      INSERT INTO bank_operation_movements (
        day_id,
        account_id,
        user_id,
        type,
        amount_cents,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      day.id,
      account.id,
      req.user.id,
      type,
      amount,
      note || null
    );
  })();

  return res.status(201).json(
    serialize(req, ownedDay(req, day.id))
  );
});

router.post('/days/:dayId/close', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const profit = toCents(req.body.profitTotal);
  const adjustments = toCents(
    req.body.adjustments || 0,
    true
  );

  if (profit == null || adjustments == null) {
    return res.status(400).json({
      ok: false,
      error: 'Lucro ou ajustes inválidos.'
    });
  }

  const accounts = db.prepare(`
    SELECT current_balance_cents
    FROM bank_operation_accounts
    WHERE day_id = ? AND active = 1
  `).all(day.id);

  const closing = accounts.reduce(
    (sum, account) => sum + account.current_balance_cents,
    0
  );

  const replacement = Math.max(
    0,
    day.opening_total_cents - closing
  );

  const operatorShare = Math.round(profit / 2);
  const amountToSend = Math.max(
    0,
    replacement + operatorShare + adjustments
  );

  db.prepare(`
    UPDATE bank_operation_days
    SET status = 'closed',
        closing_total_cents = ?,
        profit_total_cents = ?,
        operator_share_cents = ?,
        capital_replacement_cents = ?,
        adjustments_cents = ?,
        amount_to_send_cents = ?,
        closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    closing,
    profit,
    operatorShare,
    replacement,
    adjustments,
    amountToSend,
    day.id
  );

  return res.json(
    serialize(req, ownedDay(req, day.id))
  );
});

function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(payload) {
  let crc = 0xFFFF;

  for (let index = 0; index < payload.length; index++) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021)
        : (crc << 1);

      crc &= 0xFFFF;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function sanitize(value, maxLength) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

router.post('/pix-static', auth, (req, res) => {
  const pixKey = String(req.body.pixKey || '').trim();
  const merchantName = sanitize(req.body.merchantName, 25);
  const merchantCity = sanitize(req.body.merchantCity, 15);

  if (!pixKey || !merchantName || !merchantCity) {
    return res.status(400).json({
      ok: false,
      error: 'Informe chave Pix, nome do recebedor e cidade.'
    });
  }

  const merchantAccount =
    field('00', 'BR.GOV.BCB.PIX') +
    field('01', pixKey);

  const additionalData = field('05', '***');

  const partial =
    field('00', '01') +
    field('26', merchantAccount) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', merchantName) +
    field('60', merchantCity) +
    field('62', additionalData) +
    '6304';

  return res.json({
    ok: true,
    payload: partial + crc16(partial),
    hasAmount: false
  });
});

module.exports = router;
