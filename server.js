require('dotenv').config();

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
const treasuryRoutes = require('./src/routes/treasury');

const app = express();
const seedAdmin = require('./src/db/seedAdmin');
seedAdmin();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
app.use('/treasury', treasuryRoutes);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'CorePay',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});


app.get('/backup/db', (req, res) => {
  const token = req.query.token;

  if (!process.env.BACKUP_TOKEN || token !== process.env.BACKUP_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Acesso negado' });
  }

  const file = 'corepay.db';

  return res.download(file, `corepay-backup-${Date.now()}.db`);
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

app.listen(PORT, () => {
  console.log(`CorePay rodando na porta ${PORT}`);
});













