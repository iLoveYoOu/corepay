const express = require('express');
const db = require('../db/database');
const auth = require('../middlewares/auth');
const sheets = require('../services/sheetsService');

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

router.post('/sheets/operacao', auth, async (req, res) => {
  try {
    const { deposito } = req.body;

    if (!deposito || deposito <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Informe um valor de deposito valido.'
      });
    }

    const lucro = sheets.calcularLucro(deposito);
    const banca = sheets.calcularBanca(deposito, lucro);

    const resultado = await sheets.salvarOperacao({
      deposito,
      usuario: req.user.name || req.user.email,
      operador: req.user.id
    });

    return res.status(201).json({
      ok: true,
      sheets: resultado,
      calculos: {
        deposito: Number(deposito),
        lucro,
        banca,
        pctLucro: Number(((lucro / deposito) * 100).toFixed(1)),
        pctBanca: Number(((banca / deposito) * 100).toFixed(1))
      }
    });
  } catch (err) {
    console.error('Erro ao salvar operacao na planilha:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
