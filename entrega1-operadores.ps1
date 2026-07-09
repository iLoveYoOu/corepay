@'
const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Apenas admin' });
  }
  next();
}

function movimentar(userId, cents, type, description) {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) throw new Error('Wallet não encontrada');

  if (cents < 0 && wallet.balance_cents < Math.abs(cents)) {
    throw new Error('Saldo insuficiente');
  }

  const newBalance = wallet.balance_cents + cents;

  db.transaction(() => {
    db.prepare('UPDATE wallets SET balance_cents = ? WHERE id = ?').run(newBalance, wallet.id);
    db.prepare(`
      INSERT INTO ledger (wallet_id, type, amount_cents, balance_after_cents, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(wallet.id, type, cents, newBalance, description);
  })();

  return newBalance;
}

router.post('/wallets/:userId/credit', auth, requireAdmin, (req, res) => {
  try {
    const cents = Math.round(Number(req.body.amount) * 100);
    if (!cents || cents <= 0) return res.status(400).json({ ok:false, error:'Valor inválido' });

    const balance = movimentar(
      Number(req.params.userId),
      cents,
      'admin_credit',
      req.body.description || 'Crédito admin'
    );

    res.json({ ok:true, balance: balance / 100 });
  } catch (err) {
    res.status(400).json({ ok:false, error: err.message });
  }
});

router.post('/wallets/:userId/debit', auth, requireAdmin, (req, res) => {
  try {
    const cents = Math.round(Number(req.body.amount) * 100);
    if (!cents || cents <= 0) return res.status(400).json({ ok:false, error:'Valor inválido' });

    const balance = movimentar(
      Number(req.params.userId),
      -cents,
      'admin_debit',
      req.body.description || 'Débito admin'
    );

    res.json({ ok:true, balance: balance / 100 });
  } catch (err) {
    res.status(400).json({ ok:false, error: err.message });
  }
});

router.post('/users/:userId/toggle', auth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);

  const user = db.prepare('SELECT active FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ ok:false, error:'Usuário não encontrado' });

  const active = user.active ? 0 : 1;

  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, userId);

  res.json({ ok:true, active });
});

module.exports = router;
'@ | Set-Content .\src\routes\admin.js -Encoding utf8

$server = Get-Content .\server.js -Raw

if ($server -notmatch "routes/admin") {
  $server = $server -replace "const userRoutes = require\('./src/routes/users'\);", "const userRoutes = require('./src/routes/users');`r`nconst adminRoutes = require('./src/routes/admin');"
}

if ($server -notmatch "app.use\('/admin'") {
  $server = $server -replace "app.use\('/users', userRoutes\);", "app.use('/users', userRoutes);`r`napp.use('/admin', adminRoutes);"
}

Set-Content .\server.js $server -Encoding utf8

node -c .\server.js
node -c .\src\routes\admin.js
'@ | Set-Content .\entrega1-operadores.ps1 -Encoding utf8