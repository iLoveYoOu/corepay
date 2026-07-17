const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');

const router = express.Router();

function getWallet(userId) {
  return db.prepare(`
    SELECT
      w.id,
      w.balance_cents,
      u.name,
      u.email,
      u.role
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    WHERE w.user_id = ?
  `).get(userId);
}

router.get('/me', auth, (req, res) => {
  const wallet = getWallet(req.user.id);

  if (!wallet) {
    return res.status(404).json({
      ok: false,
      error: 'Carteira não encontrada.'
    });
  }

  return res.json({
    ok: true,
    wallet: {
      ...wallet,
      balance: wallet.balance_cents / 100
    }
  });
});

router.post('/deposit', auth, (req, res) => {
  return res.status(410).json({
    ok: false,
    code: 'MANUAL_WALLET_DEPOSIT_DISABLED',
    error:
      'Crédito manual pelo operador foi desativado. Use a Operação de Créditos ou um ajuste administrativo auditado.'
  });
});

module.exports = router;
