const express = require('express');
const auth = require('../middlewares/auth');

const router = express.Router();

router.post('/manual', auth, (req, res) => {
  return res.status(410).json({
    ok: false,
    paid: false,
    code: 'REAL_PAYMENT_NOT_CONFIGURED',
    error:
      'Este endpoint não envia Pix. Registre a saída na Operação Bancária somente depois de pagar no aplicativo do banco.'
  });
});

module.exports = router;
