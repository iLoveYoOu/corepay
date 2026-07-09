const axios = require('axios');

const api = axios.create({
  baseURL: process.env.ASAAS_BASE_URL,
  headers: {
    access_token: process.env.ASAAS_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function testConnection() {
  const { data } = await api.get('/myAccount');
  return data;
}

async function createCustomer({ name, email }) {
  const { data } = await api.post('/customers', {
    name,
    email,
    cpfCnpj: '12345678909'
  });

  return data;
}

async function createPixDeposit({ value, userId, name, email }) {
  const customer = await createCustomer({ name, email });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  const { data: payment } = await api.post('/payments', {
    customer: customer.id,
    billingType: 'PIX',
    value,
    dueDate: dueDate.toISOString().split('T')[0],
    description: `CorePay depósito usuário ${userId}`,
    externalReference: `deposit:${userId}:${Date.now()}`
  });

  const { data: qr } = await api.get(`/payments/${payment.id}/pixQrCode`);

  return { payment, qr };
}

module.exports = {
  testConnection,
  createPixDeposit
};
