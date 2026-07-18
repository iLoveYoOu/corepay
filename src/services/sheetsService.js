const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const lucroTabela = {
  300: 60, 350: 60, 400: 60, 450: 60, 500: 60,
  550: 70, 600: 80, 650: 90, 700: 90, 750: 100,
  800: 100, 850: 110, 900: 110, 950: 120, 1000: 120,
  1050: 125, 1100: 130, 1150: 135, 1200: 140,
  1250: 145, 1300: 150, 1350: 155, 1400: 160,
  1450: 165, 1500: 170, 1600: 190, 1650: 195,
  1700: 200, 1750: 205, 1800: 210, 1850: 215,
  1900: 220, 1950: 225, 2000: 240, 2050: 245,
  2100: 250, 2150: 255, 2200: 260, 2250: 265,
  2300: 270, 2350: 275, 2400: 280, 2450: 285,
  2500: 290, 2600: 310, 2650: 315, 2700: 320,
  2750: 325, 2800: 330, 2850: 335, 2900: 340,
  2950: 345, 3000: 360
};

const lucroTabela2 = {
  301: 100,
  401: 120,
  501: 140,
  1001: 280
};

function calcularLucro(deposito) {
  const ultimoDigito = Math.floor(deposito) % 10
  const tabela = ultimoDigito === 1 ? lucroTabela2 : lucroTabela

  const valores = Object.keys(tabela)
    .map(Number)
    .sort((a, b) => a - b);

  let lucro = 0;

  for (const valor of valores) {
    if (deposito >= valor) {
      lucro = tabela[valor];
    }
  }

  return lucro;
}

function calcularBanca(deposito, lucro) {
  return deposito - lucro;
}

function hojeBR() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit'
  }).format(new Date());
}

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY obrigatorios');
  }

  key = key.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

async function garantirAba(sheets, aba) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const existe = meta.data.sheets.some(
    s => s.properties.title === aba
  );

  if (!existe) {
    throw new Error(`Aba nao encontrada: ${aba}`);
  }
}

async function proximaLinhaColunaB(sheets, aba) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${aba}'!A2:B200`
  });

  const rows = resp.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const colunaA = String(rows[i][0] || '').trim().toLowerCase();
    const colunaB = String(rows[i][1] || '').trim();

    if (colunaA.includes('total')) break;
    if (!colunaB) return i + 2;
  }

  throw new Error('Nao encontrei linha vazia antes do TOTAL.');
}

async function salvarOperacao({ deposito, usuario, operador }) {
  if (!SPREADSHEET_ID) return { ok: false, error: 'SPREADSHEET_ID nao configurado' };

  const sheets = auth();
  const aba = hojeBR();

  await garantirAba(sheets, aba);

  const valorDeposito = Number(deposito);
  if (!valorDeposito || valorDeposito <= 0) {
    return { ok: false, error: 'Valor de deposito invalido' };
  }

  const lucro = calcularLucro(valorDeposito);
  const banca = calcularBanca(valorDeposito, lucro);

  const idFinal = `corepay_${Date.now()}_${Math.floor(Math.random() * 999999)}`;

  const linha = await proximaLinhaColunaB(sheets, aba);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${aba}'!B${linha}:H${linha}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        valorDeposito,
        '',
        usuario || '',
        banca,
        lucro,
        aba,
        idFinal
      ]]
    }
  });

  return {
    ok: true,
    linha,
    deposito: valorDeposito,
    lucro,
    banca,
    pctLucro: Number(((lucro / valorDeposito) * 100).toFixed(1)),
    pctBanca: Number(((banca / valorDeposito) * 100).toFixed(1)),
    aba
  };
}

async function salvarLancamento({ casa, deposito, banca, lucroBlogueira, lucao, saque }) {
  if (!SPREADSHEET_ID) return { ok: false, error: 'SPREADSHEET_ID nao configurado' };

  const sheets = auth();
  const aba = hojeBR();

  await garantirAba(sheets, aba);

  if (!deposito || deposito <= 0) {
    return { ok: false, error: 'Valor de deposito invalido' };
  }

  const linha = await proximaLinhaColunaB(sheets, aba);
  const idFinal = `lanc_${Date.now()}_${Math.floor(Math.random() * 999999)}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${aba}'!B${linha}:I${linha}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        deposito,
        casa || '',
        banca,
        lucroBlogueira,
        lucao,
        saque || 0,
        aba,
        idFinal
      ]]
    }
  });

  return {
    ok: true,
    linha,
    deposito,
    banca,
    lucroBlogueira,
    lucao,
    saque,
    aba
  };
}

module.exports = {
  calcularLucro,
  calcularBanca,
  salvarOperacao,
  salvarLancamento
};
