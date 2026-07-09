const express = require('express');
const auth = require('../middlewares/auth');
const asaas = require('../providers/asaas');

const router = express.Router();

router.get('/asaas/test', auth, async (req, res) => {
  try {
    const data = await asaas.testConnection();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.response?.data || err.message
    });
  }
});

module.exports = router;