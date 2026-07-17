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













