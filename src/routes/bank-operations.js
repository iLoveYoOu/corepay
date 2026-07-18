const express = require('express');
const auth = require('../middlewares/auth');
const db = require('../db/database');
const sheets = require('../services/sheetsService');
const { calcularLucro, calcularBanca } = require('../services/sheetsService');

const router = express.Router();

db.exec(`
CREATE TABLE IF NOT EXISTS bank_operation_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
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
  UNIQUE(company_id, user_id, operation_date),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (company_id) REFERENCES companies(id)
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
  idempotency_key TEXT,
  reversed INTEGER NOT NULL DEFAULT 0,
  reversed_at TEXT,
  reversal_reason TEXT,
  reversed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES bank_operation_days(id),
  FOREIGN KEY (account_id) REFERENCES bank_operation_accounts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_days_user
ON bank_operation_days(user_id, operation_date);

CREATE INDEX IF NOT EXISTS idx_bank_days_company_user
ON bank_operation_days(company_id, user_id, operation_date);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_day
ON bank_operation_accounts(day_id);

CREATE INDEX IF NOT EXISTS idx_bank_movements_day
ON bank_operation_movements(day_id, created_at);

CREATE TABLE IF NOT EXISTS bank_operation_launches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  casa TEXT NOT NULL,
  deposito_cents INTEGER NOT NULL,
  banca_cents INTEGER NOT NULL,
  lucro_blogueira_cents INTEGER NOT NULL,
  lucao_cents INTEGER NOT NULL,
  saque_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES bank_operation_days(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_launches_day
ON bank_operation_launches(day_id, created_at);
`);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`)
    .all()
    .some(item => item.name === column);
}

function hasLegacyBankDayUniqueConstraint() {
  return db
    .prepare(`PRAGMA index_list('bank_operation_days')`)
    .all()
    .filter(index => index.unique)
    .some(index => {
      const columns = db
        .prepare(`
          SELECT name
          FROM pragma_index_info(?)
          ORDER BY seqno
        `)
        .all(index.name)
        .map(column => column.name);

      return (
        columns.length === 2 &&
        columns[0] === 'user_id' &&
        columns[1] === 'operation_date'
      );
    });
}

function migrateLegacyBankDayConstraint() {
  if (!hasLegacyBankDayUniqueConstraint()) {
    return;
  }

  db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS bank_operation_days__migrated;

        CREATE TABLE bank_operation_days__migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          company_id INTEGER NOT NULL,
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
          UNIQUE(company_id, user_id, operation_date),
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        INSERT INTO bank_operation_days__migrated (
          id,
          user_id,
          company_id,
          operation_date,
          status,
          opening_total_cents,
          closing_total_cents,
          profit_total_cents,
          operator_share_cents,
          capital_replacement_cents,
          adjustments_cents,
          amount_to_send_cents,
          opened_at,
          closed_at
        )
        SELECT
          id,
          user_id,
          company_id,
          operation_date,
          status,
          opening_total_cents,
          closing_total_cents,
          profit_total_cents,
          operator_share_cents,
          capital_replacement_cents,
          adjustments_cents,
          amount_to_send_cents,
          opened_at,
          closed_at
        FROM bank_operation_days;

        DROP TABLE bank_operation_days;
        ALTER TABLE bank_operation_days__migrated
          RENAME TO bank_operation_days;
      `);

      const violations = db
        .prepare('PRAGMA foreign_key_check')
        .all();

      if (violations.length) {
        throw new Error(
          'A migração das operações bancárias encontrou referências inválidas.'
        );
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

for (const [column, definition] of [
  ['idempotency_key', 'TEXT'],
  ['reversed', 'INTEGER NOT NULL DEFAULT 0'],
  ['reversed_at', 'TEXT'],
  ['reversal_reason', 'TEXT'],
  ['reversed_by', 'INTEGER']
]) {
  if (!columnExists('bank_operation_movements', column)) {
    db.exec(`
      ALTER TABLE bank_operation_movements
      ADD COLUMN ${column} ${definition}
    `);
  }
}

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_movement_idempotency
ON bank_operation_movements(day_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
`);

db.prepare(`
  UPDATE bank_operation_days
  SET company_id = (
    SELECT users.company_id
    FROM users
    WHERE users.id = bank_operation_days.user_id
  )
  WHERE company_id IS NULL
`).run();

migrateLegacyBankDayConstraint();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bank_days_user
  ON bank_operation_days(user_id, operation_date);

  CREATE INDEX IF NOT EXISTS idx_bank_days_company_user
  ON bank_operation_days(company_id, user_id, operation_date);
`);

function operationDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );

  const beforeOpening =
    parts.hour < 8 ||
    (parts.hour === 8 && parts.minute < 30);

  const date = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day
  ));

  if (beforeOpening) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}

function toCents(value, allowNegative = false) {
  let text = String(value ?? '').trim();

  if (!text) return null;

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }

  const number = Number(text);
  const cents = Math.round(number * 100);

  if (!Number.isFinite(number)) return null;
  if (!Number.isSafeInteger(cents)) return null;
  if (!allowNegative && number < 0) return null;

  return cents;
}

function money(cents) {
  return Number(cents || 0) / 100;
}

function ownedDay(req, id) {
  return db.prepare(`
    SELECT *
    FROM bank_operation_days
    WHERE id = ?
      AND user_id = ?
      AND company_id = ?
  `).get(
    Number(id),
    req.user.id,
    req.user.companyId
  );
}

function serialize(req, day) {
  if (!day) {
    return {
      ok: true,
      operationDate: operationDate(),
      day: null,
      accounts: [],
      movements: [],
      launches: [],
      totalLucao: 0,
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

  const launches = db.prepare(`
    SELECT *
    FROM bank_operation_launches
    WHERE day_id = ?
    ORDER BY id DESC
    LIMIT 300
  `).all(day.id);

  const totalLucaoCents = launches.reduce(
    (sum, l) => sum + l.lucao_cents,
    0
  );

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
    .filter(item => item.type === 'entry' && !item.reversed)
    .reduce((sum, item) => sum + item.amount_cents, 0);

  const exits = movements
    .filter(item => item.type === 'exit' && !item.reversed)
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
      reversed: Boolean(item.reversed),
      amount: money(item.amount_cents)
    })),
    launches: launches.map(l => ({
      ...l,
      deposito: money(l.deposito_cents),
      banca: money(l.banca_cents),
      lucroBlogueira: money(l.lucro_blogueira_cents),
      lucao: money(l.lucao_cents),
      saque: money(l.saque_cents)
    })),
    totalLucao: money(totalLucaoCents),
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
    WHERE user_id = ?
      AND company_id = ?
      AND operation_date = ?
  `).get(
    req.user.id,
    req.user.companyId,
    operationDate()
  );

  return res.json(serialize(req, day));
});

router.get('/days/:dayId', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day) {
    return res.status(404).json({
      ok: false,
      error: 'Dia operacional não encontrado.'
    });
  }

  return res.json(serialize(req, day));
});

const DEFAULT_BANKS = [
  { name: 'Pagbank', purpose: 'both', pixKey: '' },
  { name: 'PicPay', purpose: 'both', pixKey: '' },
  { name: 'MP', purpose: 'both', pixKey: '' },
  { name: 'Nubank', purpose: 'both', pixKey: '' },
  { name: 'Neon', purpose: 'both', pixKey: '' }
];

router.post('/open', auth, (req, res) => {
  let accounts = Array.isArray(req.body.accounts)
    ? req.body.accounts
    : [];

  if (!accounts.length) {
    accounts = DEFAULT_BANKS;
  }

  const normalized = [];

  for (const account of accounts) {
    const name = String(account.name || '').trim();
    const purpose = String(account.purpose || 'both');
    const opening = toCents(account.openingBalance ?? 0);

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
    WHERE user_id = ?
      AND company_id = ?
      AND operation_date = ?
  `).get(req.user.id, req.user.companyId, date);

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
      req.user.companyId,
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
  const idempotencyKey = String(
    req.get('Idempotency-Key') ||
    req.body.idempotencyKey ||
    ''
  ).trim().slice(0, 120) || null;

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

  if (
    (type === 'entry' && account.purpose === 'pay') ||
    (type === 'exit' && account.purpose === 'receive')
  ) {
    return res.status(400).json({
      ok: false,
      error:
        type === 'entry'
          ? 'Este banco foi configurado somente para pagamentos.'
          : 'Este banco foi configurado somente para recebimentos.'
    });
  }

  if (idempotencyKey) {
    const duplicate = db.prepare(`
      SELECT id
      FROM bank_operation_movements
      WHERE day_id = ? AND idempotency_key = ?
    `).get(day.id, idempotencyKey);

    if (duplicate) {
      return res.json(serialize(req, ownedDay(req, day.id)));
    }
  }

  try {
    db.transaction(() => {
      const currentAccount = db.prepare(`
        SELECT *
        FROM bank_operation_accounts
        WHERE id = ? AND day_id = ? AND active = 1
      `).get(account.id, day.id);

      if (!currentAccount) {
        throw new Error('Banco não encontrado.');
      }

      const currentDelta = type === 'entry'
        ? amount
        : -amount;
      const finalBalance =
        currentAccount.current_balance_cents + currentDelta;

      if (finalBalance < 0) {
        throw new Error(
          'O saldo do banco não pode ficar negativo.'
        );
      }

      db.prepare(`
        UPDATE bank_operation_accounts
        SET current_balance_cents = ?
        WHERE id = ?
      `).run(finalBalance, currentAccount.id);

      db.prepare(`
        INSERT INTO bank_operation_movements (
          day_id,
          account_id,
          user_id,
          type,
          amount_cents,
          note,
          idempotency_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        day.id,
        currentAccount.id,
        req.user.id,
        type,
        amount,
        note || null,
        idempotencyKey
      );
    }).immediate();
  } catch (error) {
    if (
      idempotencyKey &&
      error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      return res.json(serialize(req, ownedDay(req, day.id)));
    }

    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }

  return res.status(201).json(
    serialize(req, ownedDay(req, day.id))
  );
});

router.post(
  '/days/:dayId/movements/:movementId/reverse',
  auth,
  (req, res) => {
    const day = ownedDay(req, req.params.dayId);

    if (!day || day.status !== 'open') {
      return res.status(404).json({
        ok: false,
        error: 'Dia aberto não encontrado.'
      });
    }

    const reason = String(req.body.reason || '').trim();

    if (reason.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Informe o motivo do estorno.'
      });
    }

    try {
      db.transaction(() => {
        const movement = db.prepare(`
          SELECT *
          FROM bank_operation_movements
          WHERE id = ? AND day_id = ?
        `).get(Number(req.params.movementId), day.id);

        if (!movement) {
          throw new Error('Movimentação não encontrada.');
        }

        if (movement.reversed) {
          throw new Error('Esta movimentação já foi estornada.');
        }

        const account = db.prepare(`
          SELECT *
          FROM bank_operation_accounts
          WHERE id = ? AND day_id = ? AND active = 1
        `).get(movement.account_id, day.id);

        if (!account) {
          throw new Error('Banco da movimentação não encontrado.');
        }

        const delta = movement.type === 'entry'
          ? -movement.amount_cents
          : movement.amount_cents;
        const nextBalance = account.current_balance_cents + delta;

        if (nextBalance < 0) {
          throw new Error(
            'O estorno deixaria o saldo do banco negativo.'
          );
        }

        db.prepare(`
          UPDATE bank_operation_accounts
          SET current_balance_cents = ?
          WHERE id = ?
        `).run(nextBalance, account.id);

        db.prepare(`
          UPDATE bank_operation_movements
          SET reversed = 1,
              reversed_at = CURRENT_TIMESTAMP,
              reversal_reason = ?,
              reversed_by = ?
          WHERE id = ? AND reversed = 0
        `).run(reason, req.user.id, movement.id);
      })();

      return res.json(serialize(req, ownedDay(req, day.id)));
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

router.delete('/days/:dayId/accounts/:accountId', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const account = db.prepare(`
    SELECT * FROM bank_operation_accounts
    WHERE id = ? AND day_id = ? AND active = 1
  `).get(Number(req.params.accountId), day.id);

  if (!account) {
    return res.status(404).json({
      ok: false,
      error: 'Banco não encontrado.'
    });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE bank_operation_accounts
      SET active = 0
      WHERE id = ? AND day_id = ?
    `).run(account.id, day.id);

    db.prepare(`
      UPDATE bank_operation_days
      SET opening_total_cents = opening_total_cents - ?
      WHERE id = ?
    `).run(account.opening_balance_cents, day.id);
  })();

  return res.json(serialize(req, ownedDay(req, day.id)));
});

router.put('/days/:dayId/accounts/:accountId', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const account = db.prepare(`
    SELECT * FROM bank_operation_accounts
    WHERE id = ? AND day_id = ? AND active = 1
  `).get(Number(req.params.accountId), day.id);

  if (!account) {
    return res.status(404).json({
      ok: false,
      error: 'Banco não encontrado.'
    });
  }

  const name = String(req.body.name || '').trim();

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: 'Nome do banco é obrigatório.'
    });
  }

  db.prepare(`
    UPDATE bank_operation_accounts
    SET name = ?
    WHERE id = ? AND day_id = ?
  `).run(name, account.id, day.id);

  return res.json(serialize(req, ownedDay(req, day.id)));
});

router.post('/days/:dayId/launches', auth, async (req, res) => {
  try {
    const day = ownedDay(req, req.params.dayId);

    if (!day || day.status !== 'open') {
      return res.status(404).json({
        ok: false,
        error: 'Dia aberto não encontrado.'
      });
    }

    const casa = String(req.body.casa || '').trim();
    const depositoCents = toCents(req.body.deposito);
    const saqueCents = toCents(req.body.saque || 0) || 0;

    if (!casa || !depositoCents || depositoCents <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Informe a casa e o valor do depósito.'
      });
    }

    const depositoValue = depositoCents / 100;
    let bancaCents, lucroCents, lucaoCents;

    if ([81, 121, 241].includes(depositoValue)) {
      bancaCents = 0;
      lucroCents = saqueCents;
      lucaoCents = Math.round(saqueCents / 2);
    } else {
      const lucroValue = calcularLucro(depositoValue);
      lucroCents = Math.round(lucroValue * 100);
      bancaCents = depositoCents - lucroCents;
      if (saqueCents <= bancaCents) {
        lucaoCents = (bancaCents - saqueCents) + lucroCents;
      } else {
        lucaoCents = Math.round((lucroCents / 2) + ((saqueCents - bancaCents) / 2));
      }
    }

    db.prepare(`
      INSERT INTO bank_operation_launches (
        day_id, user_id, casa, deposito_cents,
        banca_cents, lucro_blogueira_cents,
        lucao_cents, saque_cents
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      day.id,
      req.user.id,
      casa,
      depositoCents,
      bancaCents,
      lucroCents,
      lucaoCents,
      saqueCents
    );

    sheets.salvarLancamento({
      casa,
      deposito: money(depositoCents),
      banca: money(bancaCents),
      lucroBlogueira: money(lucroCents),
      lucao: money(lucaoCents),
      saque: money(saqueCents)
    }).catch(err => {
      console.error('Erro ao salvar lançamento na planilha:', err.message);
    });

    return res.status(201).json(
      serialize(req, ownedDay(req, day.id))
    );
  } catch (error) {
    console.error('Erro ao criar lançamento:', error.message);
    return res.status(500).json({
      ok: false,
      error: 'Erro ao registrar lançamento.'
    });
  }
});

router.put('/days/:dayId/launches/:launchId', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const launch = db.prepare(`
    SELECT * FROM bank_operation_launches
    WHERE id = ? AND day_id = ?
  `).get(Number(req.params.launchId), day.id);

  if (!launch) {
    return res.status(404).json({
      ok: false,
      error: 'Lançamento não encontrado.'
    });
  }

  const casa = String(req.body.casa ?? launch.casa).trim();
  const depositoCents = req.body.deposito !== undefined
    ? toCents(req.body.deposito)
    : launch.deposito_cents;
  const saqueCents = req.body.saque !== undefined
    ? (toCents(req.body.saque) || 0)
    : launch.saque_cents;

  if (!casa || !depositoCents || depositoCents <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'Informe a casa e o valor do depósito.'
    });
  }

  const depositoValue = depositoCents / 100;
  let bancaCents, lucroCents, lucaoCents;

  if ([81, 121, 241].includes(depositoValue)) {
    bancaCents = 0;
    lucroCents = saqueCents;
    lucaoCents = Math.round(saqueCents / 2);
  } else {
    const lucroValue = calcularLucro(depositoValue);
    lucroCents = Math.round(lucroValue * 100);
    bancaCents = depositoCents - lucroCents;
    if (saqueCents <= bancaCents) {
      lucaoCents = (bancaCents - saqueCents) + lucroCents;
    } else {
      lucaoCents = Math.round((lucroCents / 2) + ((saqueCents - bancaCents) / 2));
    }
  }

  db.prepare(`
    UPDATE bank_operation_launches
    SET casa = ?,
        deposito_cents = ?,
        banca_cents = ?,
        lucro_blogueira_cents = ?,
        lucao_cents = ?,
        saque_cents = ?
    WHERE id = ? AND day_id = ?
  `).run(casa, depositoCents, bancaCents, lucroCents, lucaoCents, saqueCents, launch.id, day.id);

  return res.json(
    serialize(req, ownedDay(req, day.id))
  );
});

router.delete('/days/:dayId/launches/:launchId', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  const launch = db.prepare(`
    SELECT * FROM bank_operation_launches
    WHERE id = ? AND day_id = ?
  `).get(Number(req.params.launchId), day.id);

  if (!launch) {
    return res.status(404).json({
      ok: false,
      error: 'Lançamento não encontrado.'
    });
  }

  db.prepare(`
    DELETE FROM bank_operation_launches
    WHERE id = ? AND day_id = ?
  `).run(launch.id, day.id);

  return res.json(
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

router.post('/days/:dayId/reset', auth, (req, res) => {
  const day = ownedDay(req, req.params.dayId);

  if (!day || day.status !== 'open') {
    return res.status(404).json({
      ok: false,
      error: 'Dia aberto não encontrado.'
    });
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM bank_operation_launches
      WHERE day_id = ?
    `).run(day.id);

    db.prepare(`
      DELETE FROM bank_operation_movements
      WHERE day_id = ?
    `).run(day.id);

    db.prepare(`
      UPDATE bank_operation_accounts
      SET current_balance_cents = opening_balance_cents
      WHERE day_id = ?
    `).run(day.id);
  })();

  return res.json(serialize(req, ownedDay(req, day.id)));
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

router.get('/history', auth, (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 30, 1),
    180
  );

  const days = db.prepare(`
    SELECT *
    FROM bank_operation_days
    WHERE user_id = ?
      AND company_id = ?
    ORDER BY operation_date DESC, id DESC
    LIMIT ?
  `).all(req.user.id, req.user.companyId, limit);

  return res.json({
    ok: true,
    days: days.map(day => ({
      id: day.id,
      operationDate: day.operation_date,
      status: day.status,
      openingTotal: money(day.opening_total_cents),
      closingTotal:
        day.closing_total_cents == null
          ? null
          : money(day.closing_total_cents),
      profitTotal: money(day.profit_total_cents),
      operatorShare: money(day.operator_share_cents),
      capitalReplacement: money(day.capital_replacement_cents),
      adjustments: money(day.adjustments_cents),
      amountToSend: money(day.amount_to_send_cents),
      openedAt: day.opened_at,
      closedAt: day.closed_at
    }))
  });
});

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
