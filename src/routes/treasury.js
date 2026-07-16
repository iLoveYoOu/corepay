const express = require('express');
const auth = require('../middlewares/auth');
const db = require('../db/database');

const router = express.Router();

const BANKS = Object.freeze([
  { code: 'pagbank', name: 'PagBank' },
  { code: 'inter', name: 'Inter' },
  { code: 'mercado_pago', name: 'Mercado Pago' },
  { code: 'neon', name: 'Neon' },
  { code: 'bradesco', name: 'Bradesco' },
  { code: 'next', name: 'Next' }
]);

const VALID_BANKS = new Set(BANKS.map(bank => bank.code));

function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({
      ok: false,
      error: 'Apenas administradores podem executar esta ação.'
    });
  }

  next();
}

function numberToCents(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');

  const number = Number(normalized);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.round(number * 100);
}

function saoPauloNow() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function dateString(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function previousDateString(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);

  return dateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function getOperationalContext() {
  const now = saoPauloNow();
  const minuteOfDay = now.hour * 60 + now.minute;

  const startsAt = 8 * 60 + 30;
  const closesAt = 3 * 60;

  if (minuteOfDay >= startsAt) {
    const operationDate = dateString(
      now.year,
      now.month,
      now.day
    );

    return {
      active: true,
      operationDate,
      operationCode: `OP-${operationDate}`,
      period: 'day'
    };
  }

  if (minuteOfDay < closesAt) {
    const operationDate = previousDateString(
      now.year,
      now.month,
      now.day
    );

    return {
      active: true,
      operationDate,
      operationCode: `OP-${operationDate}`,
      period: 'night'
    };
  }

  return {
    active: false,
    operationDate: null,
    operationCode: null,
    period: 'closed_window'
  };
}

function autoCloseOldDays(currentOperationDate, companyId) {
  if (!currentOperationDate) {
    return;
  }

  db.prepare(`
    UPDATE treasury_days
    SET status = 'closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
    WHERE status = 'open'
      AND company_id = ?
      AND operation_date != ?
  `).run(companyId, currentOperationDate);
}

function getDayByDate(operationDate, companyId) {
  return db.prepare(`
    SELECT
      d.*,
      opener.name AS opened_by_name,
      closer.name AS closed_by_name
    FROM treasury_days d
    LEFT JOIN users opener ON opener.id = d.created_by
    LEFT JOIN users closer ON closer.id = d.closed_by
    WHERE d.operation_date = ?
      AND d.company_id = ?
  `).get(operationDate, companyId);
}

function getBalances(dayId) {
  const rows = db.prepare(`
    SELECT
      bank_code,
      opening_balance_cents,
      balance_cents,
      updated_at
    FROM treasury_bank_balances
    WHERE treasury_day_id = ?
  `).all(dayId);

  const byCode = new Map(
    rows.map(row => [row.bank_code, row])
  );

  return BANKS.map(bank => {
    const balance = byCode.get(bank.code);

    return {
      code: bank.code,
      name: bank.name,
      openingBalance:
        (balance?.opening_balance_cents || 0) / 100,
      balance:
        (balance?.balance_cents || 0) / 100,
      updatedAt: balance?.updated_at || null
    };
  });
}

function getTransactions(dayId) {
  return db.prepare(`
    SELECT
      t.id,
      t.bank_code,
      t.movement_type,
      t.amount_cents,
      t.note,
      t.capital_before_cents,
      t.capital_after_cents,
      t.bank_before_cents,
      t.bank_after_cents,
      t.reversed,
      t.reversed_at,
      t.reversal_reason,
      t.created_at,
      u.name AS operator_name,
      u.email AS operator_email
    FROM treasury_transactions t
    INNER JOIN users u ON u.id = t.user_id
    WHERE t.treasury_day_id = ?
    ORDER BY t.id DESC
  `).all(dayId).map(row => ({
    id: row.id,
    bank: row.bank_code,
    type: row.movement_type,
    amount: row.amount_cents / 100,
    note: row.note,
    capitalBefore: row.capital_before_cents / 100,
    capitalAfter: row.capital_after_cents / 100,
    bankBefore: row.bank_before_cents / 100,
    bankAfter: row.bank_after_cents / 100,
    reversed: Boolean(row.reversed),
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    createdAt: row.created_at,
    operatorName: row.operator_name,
    operatorEmail: row.operator_email
  }));
}

function buildDayPayload(day, context) {
  if (!day) {
    return {
      context,
      day: null,
      banks: BANKS.map(bank => ({
        code: bank.code,
        name: bank.name,
        openingBalance: 0,
        balance: 0
      })),
      transactions: [],
      totals: {
        bankBalance: 0,
        capitalAvailable: 0,
        controlledCapital: 0,
        depositedToday: 0,
        withdrawnToday: 0
      }
    };
  }

  const banks = getBalances(day.id);
  const transactions = getTransactions(day.id);

  const bankBalance = banks.reduce(
    (sum, bank) => sum + bank.balance,
    0
  );

  const depositedToday = transactions
    .filter(item =>
      item.type === 'deposit' &&
      !item.reversed
    )
    .reduce((sum, item) => sum + item.amount, 0);

  const withdrawnToday = transactions
    .filter(item =>
      item.type === 'withdraw' &&
      !item.reversed
    )
    .reduce((sum, item) => sum + item.amount, 0);

  const capitalAvailable =
    day.capital_available_cents / 100;

  return {
    context,
    day: {
      id: day.id,
      operationCode: day.operation_code,
      operationDate: day.operation_date,
      capitalInitial: day.capital_initial_cents / 100,
      capitalAvailable,
      status: day.status,
      openedAt: day.opened_at,
      closedAt: day.closed_at,
      openedBy: day.opened_by_name,
      closedBy: day.closed_by_name
    },
    banks,
    transactions,
    totals: {
      bankBalance,
      capitalAvailable,
      controlledCapital:
        bankBalance + capitalAvailable,
      depositedToday,
      withdrawnToday,
      netMovement:
        withdrawnToday - depositedToday
    }
  };
}

router.get('/today', auth, (req, res) => {
  const context = getOperationalContext();

  autoCloseOldDays(
    context.operationDate,
    req.user.companyId
  );

  const day = context.operationDate
    ? getDayByDate(
        context.operationDate,
        req.user.companyId
      )
    : null;

  return res.json({
    ok: true,
    ...buildDayPayload(day, context)
  });
});

router.post('/open', auth, (req, res) => {
  const context = getOperationalContext();

  if (!context.active) {
    return res.status(400).json({
      ok: false,
      error:
        'A operação está fechada entre 03:00 e 08:29.'
    });
  }

  autoCloseOldDays(
    context.operationDate,
    req.user.companyId
  );

  const existing = getDayByDate(
    context.operationDate,
    req.user.companyId
  );

  if (existing) {
    return res.status(409).json({
      ok: false,
      error: 'O dia operacional já foi iniciado.'
    });
  }

  const capitalInitialCents =
    numberToCents(req.body.capitalInitial);

  if (!capitalInitialCents) {
    return res.status(400).json({
      ok: false,
      error: 'Informe um capital inicial válido.'
    });
  }

  const inputBalances =
    req.body.openingBalances &&
    typeof req.body.openingBalances === 'object'
      ? req.body.openingBalances
      : {};

  const openingBalances = {};

  let totalOpeningBalances = 0;

  for (const bank of BANKS) {
    const cents = numberToCents(
      inputBalances[bank.code]
    );

    openingBalances[bank.code] = cents;
    totalOpeningBalances += cents;
  }

  if (totalOpeningBalances > capitalInitialCents) {
    return res.status(400).json({
      ok: false,
      error:
        'A soma dos saldos iniciais dos bancos não pode ultrapassar o capital inicial.'
    });
  }

  const transaction = db.transaction(() => {
    const capitalAvailableCents =
      capitalInitialCents - totalOpeningBalances;

    const result = db.prepare(`
      INSERT INTO treasury_days (
        company_id,
        operation_code,
        operation_date,
        capital_initial_cents,
        capital_available_cents,
        status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `).run(
      req.user.companyId,
      context.operationCode,
      context.operationDate,
      capitalInitialCents,
      capitalAvailableCents,
      req.user.id
    );

    const dayId = Number(result.lastInsertRowid);

    const insertBalance = db.prepare(`
      INSERT INTO treasury_bank_balances (
        treasury_day_id,
        bank_code,
        opening_balance_cents,
        balance_cents
      )
      VALUES (?, ?, ?, ?)
    `);

    const insertTransaction = db.prepare(`
      INSERT INTO treasury_transactions (
        treasury_day_id,
        user_id,
        bank_code,
        movement_type,
        amount_cents,
        note,
        capital_before_cents,
        capital_after_cents,
        bank_before_cents,
        bank_after_cents
      )
      VALUES (?, ?, ?, 'opening', ?, ?, ?, ?, 0, ?)
    `);

    let capitalRunning = capitalInitialCents;

    for (const bank of BANKS) {
      const openingCents =
        openingBalances[bank.code] || 0;

      insertBalance.run(
        dayId,
        bank.code,
        openingCents,
        openingCents
      );

      if (openingCents > 0) {
        const capitalAfter =
          capitalRunning - openingCents;

        insertTransaction.run(
          dayId,
          req.user.id,
          bank.code,
          openingCents,
          'Saldo inicial informado na abertura',
          capitalRunning,
          capitalAfter,
          openingCents
        );

        capitalRunning = capitalAfter;
      }
    }

    return dayId;
  });

  transaction();

  const day = getDayByDate(
    context.operationDate,
    req.user.companyId
  );

  return res.status(201).json({
    ok: true,
    ...buildDayPayload(day, context)
  });
});

router.post('/movement', auth, (req, res) => {
  const context = getOperationalContext();

  if (!context.active) {
    return res.status(400).json({
      ok: false,
      error:
        'Movimentações são permitidas somente entre 08:30 e 03:00.'
    });
  }

  autoCloseOldDays(
    context.operationDate,
    req.user.companyId
  );

  const day = getDayByDate(
    context.operationDate,
    req.user.companyId
  );

  if (!day) {
    return res.status(404).json({
      ok: false,
      error:
        'O capital inicial deste dia ainda não foi informado.'
    });
  }

  if (day.status !== 'open') {
    return res.status(409).json({
      ok: false,
      error: 'Este dia operacional está fechado.'
    });
  }

  const bankCode = String(req.body.bank || '').trim();
  const type = String(req.body.type || '').trim();
  const note = String(req.body.note || '').trim();

  if (!VALID_BANKS.has(bankCode)) {
    return res.status(400).json({
      ok: false,
      error: 'Banco inválido.'
    });
  }

  if (!['deposit', 'withdraw'].includes(type)) {
    return res.status(400).json({
      ok: false,
      error: 'Movimento inválido.'
    });
  }

  const amountCents = numberToCents(req.body.amount);

  if (!amountCents) {
    return res.status(400).json({
      ok: false,
      error: 'Informe um valor válido.'
    });
  }

  try {
    const execute = db.transaction(() => {
      const currentDay = db.prepare(`
        SELECT *
        FROM treasury_days
        WHERE id = ?
      `).get(day.id);

      const bank = db.prepare(`
        SELECT *
        FROM treasury_bank_balances
        WHERE treasury_day_id = ?
          AND bank_code = ?
      `).get(day.id, bankCode);

      if (!bank) {
        throw new Error('Saldo bancário não encontrado.');
      }

      const capitalBefore =
        currentDay.capital_available_cents;

      const bankBefore = bank.balance_cents;

      let capitalAfter;
      let bankAfter;

      if (type === 'deposit') {
        if (amountCents > capitalBefore) {
          throw new Error(
            'Capital disponível insuficiente para este depósito.'
          );
        }

        capitalAfter = capitalBefore - amountCents;
        bankAfter = bankBefore + amountCents;
      } else {
        if (amountCents > bankBefore) {
          throw new Error(
            'Saldo interno do banco insuficiente para este saque.'
          );
        }

        capitalAfter = capitalBefore + amountCents;
        bankAfter = bankBefore - amountCents;
      }

      db.prepare(`
        UPDATE treasury_days
        SET capital_available_cents = ?
        WHERE id = ?
      `).run(capitalAfter, day.id);

      db.prepare(`
        UPDATE treasury_bank_balances
        SET balance_cents = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE treasury_day_id = ?
          AND bank_code = ?
      `).run(bankAfter, day.id, bankCode);

      db.prepare(`
        INSERT INTO treasury_transactions (
          treasury_day_id,
          user_id,
          bank_code,
          movement_type,
          amount_cents,
          note,
          capital_before_cents,
          capital_after_cents,
          bank_before_cents,
          bank_after_cents
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        day.id,
        req.user.id,
        bankCode,
        type,
        amountCents,
        note || null,
        capitalBefore,
        capitalAfter,
        bankBefore,
        bankAfter
      );
    });

    execute();
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }

  const updatedDay = getDayByDate(
    context.operationDate,
    req.user.companyId
  );

  return res.json({
    ok: true,
    ...buildDayPayload(updatedDay, context)
  });
});

router.post('/close', auth, requireAdmin, (req, res) => {
  const context = getOperationalContext();

  const operationDate =
    String(req.body.operationDate || '').trim() ||
    context.operationDate;

  const day = operationDate
    ? getDayByDate(operationDate, req.user.companyId)
    : null;

  if (!day) {
    return res.status(404).json({
      ok: false,
      error: 'Dia operacional não encontrado.'
    });
  }

  if (day.status === 'closed') {
    return res.status(409).json({
      ok: false,
      error: 'O dia já está fechado.'
    });
  }

  db.prepare(`
    UPDATE treasury_days
    SET status = 'closed',
        closed_at = CURRENT_TIMESTAMP,
        closed_by = ?
    WHERE id = ?
  `).run(req.user.id, day.id);

  const updated = getDayByDate(
    day.operation_date,
    req.user.companyId
  );

  return res.json({
    ok: true,
    ...buildDayPayload(updated, context)
  });
});

router.post(
  '/days/:id/reopen',
  auth,
  requireAdmin,
  (req, res) => {
    const dayId = Number(req.params.id);

    const day = db.prepare(`
      SELECT *
      FROM treasury_days
      WHERE id = ?
        AND company_id = ?
    `).get(dayId, req.user.companyId);

    if (!day) {
      return res.status(404).json({
        ok: false,
        error: 'Dia operacional não encontrado.'
      });
    }

    db.prepare(`
      UPDATE treasury_days
      SET status = 'open',
          closed_at = NULL,
          closed_by = NULL,
          reopened_at = CURRENT_TIMESTAMP,
          reopened_by = ?
      WHERE id = ?
    `).run(req.user.id, dayId);

    return res.json({
      ok: true,
      message: 'Dia operacional reaberto.'
    });
  }
);

router.get('/history', auth, (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 30, 1),
    100
  );

  const days = db.prepare(`
    SELECT
      d.id,
      d.operation_code,
      d.operation_date,
      d.capital_initial_cents,
      d.capital_available_cents,
      d.status,
      d.opened_at,
      d.closed_at,
      u.name AS opened_by_name,
      (
        SELECT COALESCE(SUM(balance_cents), 0)
        FROM treasury_bank_balances b
        WHERE b.treasury_day_id = d.id
      ) AS total_bank_cents
    FROM treasury_days d
    LEFT JOIN users u ON u.id = d.created_by
    WHERE d.company_id = ?
    ORDER BY d.operation_date DESC
    LIMIT ?
  `).all(req.user.companyId, limit).map(day => ({
    id: day.id,
    operationCode: day.operation_code,
    operationDate: day.operation_date,
    capitalInitial: day.capital_initial_cents / 100,
    capitalAvailable:
      day.capital_available_cents / 100,
    bankBalance: day.total_bank_cents / 100,
    controlledCapital:
      (
        day.capital_available_cents +
        day.total_bank_cents
      ) / 100,
    status: day.status,
    openedAt: day.opened_at,
    closedAt: day.closed_at,
    openedBy: day.opened_by_name
  }));

  return res.json({
    ok: true,
    days
  });
});

module.exports = router;
