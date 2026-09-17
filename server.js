require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado.');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./src/routes/auth');
const walletRoutes = require('./src/routes/wallet');
const paymentRoutes = require('./src/routes/payments');
const userRoutes = require('./src/routes/users');
const withdrawRoutes = require('./src/routes/withdraw');
const integrationsRoutes = require('./src/routes/integrations');
const depositRoutes = require('./src/routes/deposits');
const mercadoPagoWebhookRoutes =
  require('./src/routes/mercadopago-webhooks');
const adminRoutes = require('./src/routes/admin');
const directoryRoutes = require('./src/routes/directory');
const bankOperationRoutes =
  require('./src/routes/bank-operations');
const db = require('./src/db/database');

const app = express();
app.set('trust proxy', 1);
const ARTAUTO_INSTALLER_URL =
  'https://djmqsbrxcedmkbawzvyn.supabase.co/storage/v1/object/public/artauto-updates/downloads/Instalador-ArtAuto-2.1.22.exe';
const seedAdmin = require('./src/db/seedAdmin');
seedAdmin();

const allowedOrigins = String(
  process.env.CORS_ORIGINS || ''
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      !allowedOrigins.length ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error('Origem não autorizada.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/payments', paymentRoutes);
app.use('/users', userRoutes);
app.use('/withdraw', withdrawRoutes);
app.use('/integrations', integrationsRoutes);
app.use('/deposits', depositRoutes);
app.use(
  '/webhooks/mercadopago',
  mercadoPagoWebhookRoutes
);
app.use('/admin', adminRoutes);
app.use('/directory', directoryRoutes);
app.use('/bank-operations', bankOperationRoutes);

// Rota leve para monitores externos manterem a instância disponível sem
// baixar o instalador a cada verificação.
app.get('/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, service: 'ArtAuto' });
});

// Página pública do instalador. O download só começa quando a pessoa clica
// no botão; assim, cancelar o "Salvar como" não reinicia o download sozinho.
app.get('/install', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Baixar ArtAuto</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #071525; color: #f3f7fb; }
    main { width: min(420px, calc(100% - 40px)); padding: 32px; border: 1px solid #23415f; border-radius: 18px; background: #0d2034; text-align: center; box-shadow: 0 18px 50px #0008; }
    h1 { margin: 0 0 12px; }
    p { color: #b9cadb; line-height: 1.5; }
    a { display: inline-block; margin-top: 14px; padding: 14px 22px; border-radius: 10px; background: #14b8a6; color: #031716; font-weight: 700; text-decoration: none; }
    small { display: block; margin-top: 18px; color: #8297aa; }
  </style>
</head>
<body>
  <main>
    <h1>Instalador ArtAuto</h1>
    <p>O download só será iniciado quando você clicar no botão abaixo.</p>
    <a href="${ARTAUTO_INSTALLER_URL}">Baixar ArtAuto</a>
    <small>Se cancelar, esta página continuará aberta sem repetir o download.</small>
  </main>
</body>
</html>`);
});

app.get('/health', (req, res) => {
  try {
    const requiredTables = [
      'users',
      'wallets',
      'companies',
      'bank_operation_days'
    ];
    const existingTables = new Set(
      db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
      `).all().map(item => item.name)
    );
    const missingTables = requiredTables.filter(
      table => !existingTables.has(table)
    );
    const dashboardBuilt = fs.existsSync(
      path.join(__dirname, 'dashboard', 'dist', 'index.html')
    );
    const ok = !missingTables.length && dashboardBuilt;

    return res.status(ok ? 200 : 503).json({
      ok,
      app: 'CorePay',
      status: ok ? 'online' : 'degraded',
      database: missingTables.length ? 'incomplete' : 'ready',
      dashboard: dashboardBuilt ? 'ready' : 'missing',
      missingTables,
      timestamp: new Date().toISOString()
    });
  } catch {
    return res.status(503).json({
      ok: false,
      app: 'CorePay',
      status: 'degraded',
      database: 'unavailable',
      timestamp: new Date().toISOString()
    });
  }
});


app.get('/backup/db', async (req, res, next) => {
  const authorization = String(
    req.get('authorization') || ''
  );
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (
    !process.env.BACKUP_TOKEN ||
    token !== process.env.BACKUP_TOKEN
  ) {
    return res.status(403).json({
      ok: false,
      error: 'Acesso negado'
    });
  }

  const file = path.join(
    path.dirname(db.name),
    `corepay-backup-${Date.now()}.db`
  );

  try {
    await db.backup(file);
    res.setHeader('Cache-Control', 'no-store');

    return res.download(
      file,
      path.basename(file),
      error => {
        fs.rm(file, { force: true }, () => {});

        if (error) {
          next(error);
        }
      }
    );
  } catch {
    fs.rm(file, { force: true }, () => {});

    return res.status(500).json({
      ok: false,
      error: 'Não foi possível gerar o backup.'
    });
  }
});


/* DASHBOARD VUE PRODUCAO */

const DASHBOARD_DIST = path.join(
  __dirname,
  'dashboard',
  'dist'
);

const LEGACY_PUBLIC = path.join(
  __dirname,
  'public'
);

if (fs.existsSync(DASHBOARD_DIST)) {
  console.log(
    'Dashboard Vue encontrado:',
    DASHBOARD_DIST
  );

  app.use(
    express.static(DASHBOARD_DIST, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production'
        ? '1h'
        : 0
    })
  );

  /*
   * Fallback da SPA.
   *
   * Só entrega index.html para requisições GET que aceitem HTML.
   * Rotas da API já foram registradas antes deste bloco.
   */
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      !req.accepts('html')
    ) {
      return next();
    }

    return res.sendFile(
      path.join(DASHBOARD_DIST, 'index.html')
    );
  });
} else {
  console.warn(
    'dashboard/dist não encontrado. Usando public como fallback.'
  );

  app.use(express.static(LEGACY_PUBLIC));
}

/* FIM DASHBOARD VUE PRODUCAO */

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`CorePay rodando na porta ${PORT}`);
});

module.exports = {
  app,
  server
};













