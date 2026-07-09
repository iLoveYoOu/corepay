require('dotenv').config();
const axios = require('axios');

async function main() {
  const resp = await axios.get(`${process.env.ASAAS_BASE_URL}/customers`, {
    headers: {
      access_token: process.env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'CorePay/1.0'
    }
  });

  console.log('ASAAS OK');
  console.log(resp.data);
}

main().catch(err => {
  console.error('ASAAS ERRO');
  console.error(err.response?.status, err.response?.data || err.message);
});