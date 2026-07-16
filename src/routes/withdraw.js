const express = require('express');
const auth = require('../middlewares/auth');

const router = express.Router();

router.post('/', auth, (req, res) => {
  return res.status(410).json({
    ok: false,
    withdrawn: false,
    code: 'REAL_WITHDRAW_NOT_CONFIGURED',
    error:
      'Este endpoint não transfere dinheiro. Registre a saída na Operação Bancária somente depois de sacar no banco.'
  });
});

module.exports = router;
