const crypto = require('crypto');

const MP_TOKEN =
  String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();

const MP_PAYER_EMAIL =
  String(
    process.env.MERCADO_PAGO_PAYER_EMAIL ||
    'arthurcesarmaga@gmail.com'
  ).trim();

const PUBLIC_URL =
  String(process.env.PUBLIC_URL || '')
    .trim()
    .replace(/\/+$/, '');

function requireToken() {
  if (!MP_TOKEN) {
    throw new Error(
      'MERCADO_PAGO_ACCESS_TOKEN não configurado.'
    );
  }
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      data?.cause?.[0]?.description ||
      'Erro na API do Mercado Pago.'
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

async function createPix({
  amount,
  description,
  externalReference
}) {
  requireToken();

  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Valor inválido.');
  }

  const idempotencyKey =
    crypto.randomUUID?.() ||
    `mp_${Date.now()}_${Math.random()}`;

  const payload = {
    transaction_amount: value,
    description:
      description || `Crédito CorePay R$ ${value.toFixed(2)}`,
    payment_method_id: 'pix',
    payer: {
      email: MP_PAYER_EMAIL
    },
    external_reference:
      String(externalReference || idempotencyKey)
  };

  if (PUBLIC_URL) {
    payload.notification_url =
      `${PUBLIC_URL}/webhooks/mercadopago`;
  }

  const response = await fetch(
    'https://api.mercadopago.com/v1/payments',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await readResponse(response);

  const transactionData =
    data?.point_of_interaction?.transaction_data || {};

  const pixCode = transactionData.qr_code || '';
  const qrCodeBase64 =
    transactionData.qr_code_base64 || '';

  if (!pixCode) {
    throw new Error(
      'Mercado Pago não retornou o Pix Copia e Cola.'
    );
  }

  return {
    id: String(data.id),
    status: String(data.status || ''),
    statusDetail: String(data.status_detail || ''),
    value,
    payload: pixCode,
    encodedImage: qrCodeBase64,
    expirationDate: data.date_of_expiration || null,
    raw: data
  };
}

async function getPayment(paymentId) {
  requireToken();

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        Accept: 'application/json'
      }
    }
  );

  return readResponse(response);
}

function isApproved(payment) {
  return (
    payment?.status === 'approved' ||
    payment?.status_detail === 'accredited'
  );
}

module.exports = {
  createPix,
  getPayment,
  isApproved
};
