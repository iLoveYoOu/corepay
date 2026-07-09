const express = require('express');
const auth = require('../middlewares/auth');
const asaas = require('../providers/asaas');

const router = express.Router();

router.post('/asaas/pix', auth, async (req, res) => {
  try {
    const value = Number(req.body.amount || req.body.value);

    if (!value || value <= 0) {
      return res.status(400).json({ ok: false, error: 'Valor inválido' });
    }

    const result = await asaas.createPixDeposit({
      value,
      userId: req.user.id,
      name: req.body.name || `CorePay User ${req.user.id}`,
      email: req.body.email || `user${req.user.id}@corepay.local`
    });

    res.json({
      ok: true,
      paymentId: result.payment.id,
      value,
      encodedImage: result.qr.encodedImage,
      payload: result.qr.payload,
      expirationDate: result.qr.expirationDate
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.response?.data || err.message
    });
  }
});

module.exports = router;
