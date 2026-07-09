require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/auth');
const walletRoutes = require('./src/routes/wallet');
const paymentRoutes = require('./src/routes/payments');
const userRoutes = require('./src/routes/users');
const withdrawRoutes = require('./src/routes/withdraw');
const integrationsRoutes = require('./src/routes/integrations');
const depositRoutes = require('./src/routes/deposits');
const asaasWebhookRoutes = require('./src/routes/asaas-webhooks');
const adminRoutes = require('./src/routes/admin');

const app = express();
const seedAdmin = require('./src/db/seedAdmin');
seedAdmin();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/payments', paymentRoutes);
app.use('/users', userRoutes);
app.use('/withdraw', withdrawRoutes);
app.use('/integrations', integrationsRoutes);
app.use('/deposits', depositRoutes);
app.use('/webhooks/asaas', asaasWebhookRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'CorePay',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});


app.post('/webhooks/asaas/withdraw', (req, res) => {
    console.log('==============================');
    console.log('WEBHOOK ASAAS RECEBIDO');
    console.log(new Date().toISOString());
    console.log(req.body);
    console.log('==============================');

    return res.status(200).json({
        authorized: true
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

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`CorePay rodando na porta ${PORT}`);
});













