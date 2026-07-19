const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'corepay-smoke-')
);

process.env.PORT = '4112';
process.env.JWT_SECRET = 'corepay-smoke-secret-not-for-production';
process.env.ADMIN_EMAIL = 'admin.smoke@corepay.local';
process.env.ADMIN_PASSWORD = 'SenhaTeste123!';
process.env.ADMIN_NAME = 'Admin Smoke';
process.env.DATABASE_PATH = path.join(tempDirectory, 'corepay.db');
process.env.ENABLE_MERCADOPAGO_DEPOSITS = 'false';

function prepareLegacyTreasuryDatabase(filename) {
  const legacyDb = new Database(filename);

  legacyDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (
      id,
      name,
      email,
      password_hash,
      role,
      active
    )
    VALUES (
      1,
      'Operador Legado',
      'legado@corepay.local',
      'hash-legado-inutilizado',
      'operator',
      1
    );

    CREATE TABLE treasury_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_code TEXT UNIQUE NOT NULL,
      operation_date TEXT UNIQUE NOT NULL,
      capital_initial_cents INTEGER NOT NULL,
      capital_available_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by INTEGER NOT NULL,
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      closed_by INTEGER,
      reopened_at TEXT,
      reopened_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (closed_by) REFERENCES users(id),
      FOREIGN KEY (reopened_by) REFERENCES users(id)
    );

    INSERT INTO treasury_days (
      id,
      operation_code,
      operation_date,
      capital_initial_cents,
      capital_available_cents,
      status,
      created_by
    )
    VALUES (
      1,
      'OP-2025-01-01',
      '2025-01-01',
      100000,
      25000,
      'closed',
      1
    );

    CREATE TABLE treasury_bank_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treasury_day_id INTEGER NOT NULL,
      bank_code TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL DEFAULT 0,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(treasury_day_id, bank_code),
      FOREIGN KEY (treasury_day_id) REFERENCES treasury_days(id)
    );

    INSERT INTO treasury_bank_balances (
      treasury_day_id,
      bank_code,
      opening_balance_cents,
      balance_cents
    )
    VALUES (1, 'inter', 75000, 75000);

    CREATE TABLE bank_operation_days (
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

    INSERT INTO bank_operation_days (
      id,
      user_id,
      company_id,
      operation_date,
      status,
      opening_total_cents
    )
    VALUES (1, 1, NULL, '2025-01-02', 'open', 90000);

    CREATE TABLE bank_operation_accounts (
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

    INSERT INTO bank_operation_accounts (
      id,
      day_id,
      name,
      purpose,
      opening_balance_cents,
      current_balance_cents
    )
    VALUES (1, 1, 'Banco Legado', 'both', 90000, 85000);

    CREATE TABLE bank_operation_movements (
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

    INSERT INTO bank_operation_movements (
      id,
      day_id,
      account_id,
      user_id,
      type,
      amount_cents,
      note
    )
    VALUES (1, 1, 1, 1, 'exit', 5000, 'Movimento legado');
  `);

  legacyDb.close();
}

prepareLegacyTreasuryDatabase(process.env.DATABASE_PATH);

const { server } = require('../server');
const db = require('../src/db/database');

const baseUrl = `http://127.0.0.1:${process.env.PORT}`;

async function request(route, options = {}) {
  const response = await fetch(baseUrl + route, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body
  };
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(
      `${message}\n${JSON.stringify(details, null, 2)}`
    );
  }
}

async function run() {
  await new Promise(resolve => setTimeout(resolve, 150));

  const legacyDay = db.prepare(`
    SELECT *
    FROM treasury_days
    WHERE id = 1
  `).get();
  assert(
    legacyDay?.operation_code === 'OP-2025-01-01' &&
      Number(legacyDay.company_id) > 0,
    'Migração não preservou o dia legado',
    legacyDay
  );
  assert(
    db.prepare(`
      SELECT balance_cents
      FROM treasury_bank_balances
      WHERE treasury_day_id = 1
        AND bank_code = 'inter'
    `).get()?.balance_cents === 75000,
    'Migração não preservou os saldos do dia legado'
  );

  const treasuryUniqueIndexes = db
    .prepare(`
      SELECT name
      FROM pragma_index_list('treasury_days')
      WHERE "unique" = 1
    `)
    .all();
  const hasGlobalTreasuryUnique =
    treasuryUniqueIndexes.some(index => {
      const columns = db
        .prepare(`
          SELECT name
          FROM pragma_index_info(?)
          ORDER BY seqno
        `)
        .all(index.name)
        .map(column => column.name);

      return (
        columns.length === 1 &&
        ['operation_code', 'operation_date'].includes(columns[0])
      );
    });
  assert(
    !hasGlobalTreasuryUnique,
    'Migração manteve unicidade global da tesouraria',
    treasuryUniqueIndexes
  );
  assert(
    db.prepare('PRAGMA foreign_key_check').all().length === 0,
    'Migração da tesouraria quebrou referências',
    db.prepare('PRAGMA foreign_key_check').all()
  );

  const legacyBankDay = db.prepare(`
    SELECT *
    FROM bank_operation_days
    WHERE id = 1
  `).get();
  assert(
    legacyBankDay?.operation_date === '2025-01-02' &&
      Number(legacyBankDay.company_id) > 0 &&
      legacyBankDay.opening_total_cents === 90000,
    'Migração não preservou o dia bancário legado',
    legacyBankDay
  );
  assert(
    db.prepare(`
      SELECT current_balance_cents
      FROM bank_operation_accounts
      WHERE id = 1 AND day_id = 1
    `).get()?.current_balance_cents === 85000 &&
      db.prepare(`
        SELECT amount_cents
        FROM bank_operation_movements
        WHERE id = 1 AND day_id = 1
      `).get()?.amount_cents === 5000,
    'Migração não preservou contas e movimentos bancários legados'
  );

  const bankDayUniqueColumns = db
    .prepare(`
      SELECT name
      FROM pragma_index_list('bank_operation_days')
      WHERE "unique" = 1
    `)
    .all()
    .map(index => db
      .prepare(`
        SELECT name
        FROM pragma_index_info(?)
        ORDER BY seqno
      `)
      .all(index.name)
      .map(column => column.name));
  assert(
    bankDayUniqueColumns.some(columns =>
      columns.join(',') ===
        'company_id,user_id,operation_date'
    ) &&
      !bankDayUniqueColumns.some(columns =>
        columns.join(',') === 'user_id,operation_date'
      ),
    'Migração não corrigiu a unicidade dos dias bancários',
    bankDayUniqueColumns
  );
  assert(
    db.prepare('PRAGMA foreign_key_check').all().length === 0,
    'Migração bancária quebrou referências',
    db.prepare('PRAGMA foreign_key_check').all()
  );

  const health = await request('/health');
  assert(health.status === 200, 'Health check falhou', health);

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    })
  });
  assert(adminLogin.status === 200, 'Login admin falhou', adminLogin);

  const adminHeaders = {
    authorization: `Bearer ${adminLogin.body.token}`
  };

  const operator = await request('/users', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Operador Smoke',
      email: 'OPERADOR.SMOKE@COREPAY.LOCAL',
      password: 'Operador123!'
    })
  });
  assert(operator.status === 201, 'Criação de operador falhou', operator);

  const operatorLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'operador.smoke@corepay.local',
      password: 'Operador123!'
    })
  });
  assert(operatorLogin.status === 200, 'Login operador falhou', operatorLogin);

  const operatorHeaders = {
    authorization: `Bearer ${operatorLogin.body.token}`
  };

  const secondCompany = await request('/directory/companies', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Empresa Dois',
      code: 'E2'
    })
  });
  assert(
    secondCompany.status === 201,
    'Criação da segunda empresa falhou',
    secondCompany
  );

  db.prepare(`
    INSERT INTO treasury_days (
      company_id,
      operation_code,
      operation_date,
      capital_initial_cents,
      capital_available_cents,
      status,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, 'closed', ?)
  `).run(
    secondCompany.body.companyId,
    legacyDay.operation_code,
    legacyDay.operation_date,
    50000,
    50000,
    adminLogin.body.user.id
  );
  assert(
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM treasury_days
      WHERE operation_date = ?
    `).get(legacyDay.operation_date).total === 2,
    'Tesouraria continua única globalmente entre empresas'
  );

  const secondAdmin = await request('/directory/users', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Admin Dois',
      email: 'admin.dois@corepay.local',
      password: 'AdminDois123!',
      role: 'admin',
      companyId: secondCompany.body.companyId
    })
  });
  assert(secondAdmin.status === 201, 'Criação do segundo admin falhou', secondAdmin);

  const secondAdminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin.dois@corepay.local',
      password: 'AdminDois123!'
    })
  });
  assert(secondAdminLogin.status === 200, 'Login do segundo admin falhou', secondAdminLogin);

  const secondAdminHeaders = {
    authorization: `Bearer ${secondAdminLogin.body.token}`
  };
  const crossCompanyCredit = await request(
    `/admin/wallets/${operator.body.user_id}/credit`,
    {
      method: 'POST',
      headers: secondAdminHeaders,
      body: JSON.stringify({ amount: 10 })
    }
  );
  assert(
    crossCompanyCredit.status === 404,
    'Admin acessou operador de outra empresa',
    crossCompanyCredit
  );

  const protectedSuperAdmin = await request(
    `/users/${adminLogin.body.user.id}`,
    {
      method: 'PUT',
      headers: secondAdminHeaders,
      body: JSON.stringify({ name: 'Invadido' })
    }
  );
  assert(
    protectedSuperAdmin.status === 404,
    'Admin alterou o Super Admin',
    protectedSuperAdmin
  );

  const opened = await request('/bank-operations/open', {
    method: 'POST',
    headers: operatorHeaders,
    body: JSON.stringify({
      accounts: [{
        name: 'Banco Teste',
        purpose: 'pay',
        openingBalance: '1.000',
        pixKey: ''
      }]
    })
  });
  assert(opened.status === 201, 'Abertura bancária falhou', opened);
  assert(
    opened.body.totals.current === 1000,
    'Parser monetário pt-BR falhou',
    opened
  );

  const dayId = opened.body.day.id;
  const accountId = opened.body.accounts[0].id;
  const movementRoute =
    `/bank-operations/days/${dayId}/movements`;

  const forbiddenEntry = await request(movementRoute, {
    method: 'POST',
    headers: operatorHeaders,
    body: JSON.stringify({
      accountId,
      type: 'entry',
      amount: '10,00'
    })
  });
  assert(
    forbiddenEntry.status === 400,
    'Finalidade do banco não foi aplicada',
    forbiddenEntry
  );

  const idempotentHeaders = {
    ...operatorHeaders,
    'idempotency-key': 'smoke-movement-1'
  };
  const movementBody = JSON.stringify({
    accountId,
    type: 'exit',
    amount: '100,00',
    note: 'Teste'
  });

  const firstMovement = await request(movementRoute, {
    method: 'POST',
    headers: idempotentHeaders,
    body: movementBody
  });
  const repeatedMovement = await request(movementRoute, {
    method: 'POST',
    headers: idempotentHeaders,
    body: movementBody
  });
  assert(firstMovement.status === 201, 'Movimentação falhou', firstMovement);
  assert(
    repeatedMovement.status === 200 &&
      repeatedMovement.body.totals.current === 900,
    'Idempotência falhou',
    repeatedMovement
  );

  const dayDetail = await request(
    `/bank-operations/days/${dayId}`,
    { headers: operatorHeaders }
  );
  assert(dayDetail.status === 200, 'Retomada do dia falhou', dayDetail);

  const movementId = firstMovement.body.movements[0].id;
  const reversed = await request(
    `/bank-operations/days/${dayId}/movements/${movementId}/reverse`,
    {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({ reason: 'Lançamento de teste' })
    }
  );
  assert(
    reversed.status === 200 &&
      reversed.body.totals.current === 1000 &&
      reversed.body.movements[0].reversed === true,
    'Estorno de movimentação falhou',
    reversed
  );

  for (const [route, body] of [
    ['/wallet/deposit', { amount: 10 }],
    ['/payments/manual', { amount: 10, pix: 'teste' }],
    ['/withdraw', { amount: 10, pixKey: 'teste' }]
  ]) {
    const response = await request(route, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify(body)
    });
    assert(
      response.status === 410,
      `Rota insegura continua ativa: ${route}`,
      response
    );
  }

  const movedOperator = await request(
    `/directory/users/${operator.body.user_id}`,
    {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        companyId: secondCompany.body.companyId
      })
    }
  );
  assert(
    movedOperator.status === 200,
    'Transferência do operador falhou',
    movedOperator
  );

  const staleAfterCompanyMove = await request(
    '/bank-operations/today',
    { headers: operatorHeaders }
  );
  assert(
    staleAfterCompanyMove.status === 401,
    'Transferência não revogou a sessão anterior',
    staleAfterCompanyMove
  );

  const movedOperatorLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'operador.smoke@corepay.local',
      password: 'Operador123!'
    })
  });
  assert(
    movedOperatorLogin.status === 200,
    'Login após transferência falhou',
    movedOperatorLogin
  );

  const movedOperatorHeaders = {
    authorization: `Bearer ${movedOperatorLogin.body.token}`
  };
  const previousCompanyDay = await request(
    `/bank-operations/days/${dayId}`,
    { headers: movedOperatorHeaders }
  );
  assert(
    previousCompanyDay.status === 404,
    'Operador transferido acessou dia da empresa anterior',
    previousCompanyDay
  );

  const movedHistory = await request(
    '/bank-operations/history?limit=30',
    { headers: movedOperatorHeaders }
  );
  assert(
    movedHistory.status === 200 &&
      !movedHistory.body.days.some(day => day.id === dayId),
    'Histórico vazou dados da empresa anterior',
    movedHistory
  );

  const openedAfterCompanyMove = await request(
    '/bank-operations/open',
    {
      method: 'POST',
      headers: movedOperatorHeaders,
      body: JSON.stringify({
        accounts: [{
          name: 'Banco Empresa Dois',
          purpose: 'both',
          openingBalance: '500,00'
        }]
      })
    }
  );
  assert(
    openedAfterCompanyMove.status === 201 &&
      Number(openedAfterCompanyMove.body.day.company_id) ===
        Number(secondCompany.body.companyId),
    'Operador não abriu a mesma data na nova empresa',
    openedAfterCompanyMove
  );
  assert(
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM bank_operation_days
      WHERE user_id = ?
        AND operation_date = ?
    `).get(
      operator.body.user_id,
      openedAfterCompanyMove.body.day.operation_date
    ).total === 2,
    'Unicidade antiga ainda bloqueia a mesma data entre empresas'
  );

  const passwordReset = await request(
    `/directory/users/${operator.body.user_id}/reset-password`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ password: 'NovaSenha123!' })
    }
  );
  assert(passwordReset.status === 200, 'Reset de senha falhou', passwordReset);

  const revoked = await request('/bank-operations/today', {
    headers: movedOperatorHeaders
  });
  assert(revoked.status === 401, 'Sessão antiga não foi revogada', revoked);

  // ── CHINO closing tests ──
  const chinoSession = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'operador.smoke@corepay.local',
      password: 'NovaSenha123!'
    })
  });
  assert(chinoSession.status === 200, 'Login CHINO falhou', chinoSession);

  const chinoHeaders = {
    authorization: `Bearer ${chinoSession.body.token}`
  };

  const chinoCompanyId = secondCompany.body.companyId;
  const chinoUserId = operator.body.user_id;

  let chinoTestDay = 3;

  function createTestDay() {
    const operationDate = `2025-01-${String(chinoTestDay++).padStart(2, '0')}`;
    const result = db.prepare(`
      INSERT INTO bank_operation_days
        (user_id, company_id, operation_date, status, opening_total_cents)
      VALUES (?, ?, ?, 'open', ?)
    `).run(chinoUserId, chinoCompanyId, operationDate, 5000000);
    const dayId = Number(result.lastInsertRowid);
    db.prepare(`
      INSERT INTO bank_operation_accounts
        (day_id, name, purpose, opening_balance_cents, current_balance_cents)
      VALUES (?, ?, 'both', ?, ?)
    `).run(dayId, 'CHINO Conta', 5000000, 5000000);
    return dayId;
  }

  function addLaunch(dayId, depositoCents, saqueCents, bancaCents, lucroCents) {
    db.prepare(`
      INSERT INTO bank_operation_launches
        (day_id, user_id, casa, deposito_cents, banca_cents,
         lucro_blogueira_cents, lucao_cents, saque_cents)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(dayId, chinoUserId, 'CHINO Teste', depositoCents, bancaCents, lucroCents, saqueCents);

    db.prepare(`
      UPDATE bank_operation_accounts
      SET current_balance_cents = current_balance_cents - ?
      WHERE day_id = ? AND active = 1
    `).run(depositoCents, dayId);
  }

  function assertChinoClose(day, expected) {
    assert(
      Number(day.profitTotal) === Number(expected.profitTotal),
      `CHINO profitTotal esperado ${expected.profitTotal} recebido ${day.profitTotal}`,
      { day, expected }
    );
    assert(
      Number(day.operatorShare) === Number(expected.operatorShare),
      `CHINO operatorShare esperado ${expected.operatorShare} recebido ${day.operatorShare}`,
      { day, expected }
    );
    assert(
      Number(day.amountToSend) === Number(expected.amountToSend),
      `CHINO amountToSend esperado ${expected.amountToSend} recebido ${day.amountToSend}`,
      { day, expected }
    );
  }

  // Test 1: CHINO example from sheet 1507 (negative)
  // deposito=32722, sacado=31803, banca=28680, lucro=4020 (R$)
  // LIQUIDO = 31803 - 28680 = 3123
  // METADE = 3123/2 = 1561.50
  // MANDAR_LUCAO = 1561.50 - 4020 = -2458.50
  {
    const dayId = createTestDay();
    addLaunch(dayId, 3272200, 3180300, 2868000, 402000);
    const result = await request(`/bank-operations/days/${dayId}/close`, {
      method: 'POST',
      headers: chinoHeaders,
      body: JSON.stringify({ adjustments: '0' })
    });
    assert(result.status === 200, 'CHINO negativo: fechamento falhou', result);
    assertChinoClose(result.body.day, { profitTotal: 4020, operatorShare: 1561.50, amountToSend: -2458.50 });
  }

  // Test 2: Positive MANDAR_LUCAO
  // sacado=8000, banca=5000, lucro=1000 (R$)
  // LIQUIDO = 3000, METADE = 1500
  // MANDAR_LUCAO = 1500 - 1000 = 500
  {
    const dayId = createTestDay();
    addLaunch(dayId, 1000000, 800000, 500000, 100000);
    const result = await request(`/bank-operations/days/${dayId}/close`, {
      method: 'POST',
      headers: chinoHeaders,
      body: JSON.stringify({ adjustments: '0' })
    });
    assert(result.status === 200, 'CHINO positivo: fechamento falhou', result);
    assertChinoClose(result.body.day, { profitTotal: 1000, operatorShare: 1500, amountToSend: 500 });
  }

  // Test 3: Zero MANDAR_LUCAO (METADE == totalLucro)
  // sacado=7000, banca=5000, lucro=1000 (R$)
  // LIQUIDO = 2000, METADE = 1000
  // MANDAR_LUCAO = 1000 - 1000 = 0
  {
    const dayId = createTestDay();
    addLaunch(dayId, 1000000, 700000, 500000, 100000);
    const result = await request(`/bank-operations/days/${dayId}/close`, {
      method: 'POST',
      headers: chinoHeaders,
      body: JSON.stringify({ adjustments: '0' })
    });
    assert(result.status === 200, 'CHINO zero: fechamento falhou', result);
    assertChinoClose(result.body.day, { profitTotal: 1000, operatorShare: 1000, amountToSend: 0 });
  }

  // ── Reset day with previous closings ──
  {
    const resetDayId = openedAfterCompanyMove.body.day.id;

    db.prepare(`
      INSERT INTO bank_operation_launches
        (day_id, user_id, casa, deposito_cents, banca_cents,
         lucro_blogueira_cents, lucao_cents, saque_cents)
      VALUES (?, ?, 'Reset Test', 100000, 50000, 20000, 0, 50000)
    `).run(resetDayId, chinoUserId);

    const beforeResetHistory = await request(
      '/bank-operations/history?limit=30',
      { headers: chinoHeaders }
    );
    assert(
      beforeResetHistory.status === 200 &&
        beforeResetHistory.body.days.length > 0,
      'Deveria haver histórico antes do reset',
      beforeResetHistory
    );

    const resetResult = await request(
      `/bank-operations/days/${resetDayId}/reset`,
      {
        method: 'POST',
        headers: chinoHeaders,
        body: JSON.stringify({})
      }
    );
    assert(resetResult.status === 200, 'Reset do dia falhou', resetResult);
    assert(
      resetResult.body.launches.length === 0,
      'Lançamentos do dia aberto não foram limpos',
      resetResult
    );

    const afterResetHistory = await request(
      '/bank-operations/history?limit=30',
      { headers: chinoHeaders }
    );
    assert(
      afterResetHistory.status === 200 &&
        afterResetHistory.body.days.length === 1 &&
        afterResetHistory.body.days[0].id === resetDayId &&
        afterResetHistory.body.days[0].status === 'open',
      'Histórico deveria manter somente o dia atual aberto após o reset',
      afterResetHistory
    );
  }

  console.log('CorePay smoke test: OK');
}

run()
  .then(() => {
    server.close(() => {
      db.close();
      fs.rmSync(tempDirectory, {
        recursive: true,
        force: true
      });
      process.exit(0);
    });
  })
  .catch(error => {
    console.error(error.stack || error);
    server.close(() => {
      db.close();
      process.exit(1);
    });
  });
