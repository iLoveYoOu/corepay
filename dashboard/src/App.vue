@'
<template>
  <div class="page">
    <div v-if="!token" class="login">
      <h1>CorePay</h1>
      <input v-model="email" placeholder="E-mail" />
      <input v-model="password" type="password" placeholder="Senha" />
      <button @click="login">Entrar</button>
      <p class="error">{{ error }}</p>
    </div>

    <div v-else class="layout">
      <aside>
        <h2>CorePay</h2>
        <button @click="tab='dashboard'">Dashboard</button>
        <button v-if="wallet.role==='admin'" @click="tab='operators'">Operadores</button>
        <button @click="tab='statement'">Extrato</button>
        <button @click="logout" class="danger">Sair</button>
      </aside>

      <main>
        <section v-if="tab==='dashboard'">
          <h1>Dashboard</h1>

          <div class="cards">
            <div class="card">
              <span>Saldo disponível</span>
              <strong>{{ money(wallet.balance) }}</strong>
            </div>
            <div class="card">
              <span>Usuário</span>
              <strong>{{ wallet.name }}</strong>
            </div>
            <div class="card">
              <span>Perfil</span>
              <strong>{{ wallet.role }}</strong>
            </div>
          </div>

          <div class="actions">
            <button @click="depositarAsaas">Carregar saldo</button>
            <button @click="pagar">Pagar Pix</button>
            <button class="orange" @click="sacar">Sacar</button>
            <button @click="alterarSenha">Alterar senha</button>
          </div>
        </section>

        <section v-if="tab==='operators'">
          <h1>Operadores</h1>

          <div class="form">
            <input v-model="newUser.name" placeholder="Nome">
            <input v-model="newUser.email" placeholder="E-mail">
            <input v-model="newUser.password" placeholder="Senha">
            <button @click="criarOperador">Criar</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Email</th><th>Perfil</th><th>Saldo</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in operators" :key="u.id">
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td>{{ u.role }}</td>
                <td>{{ money(u.balance) }}</td>
                <td>{{ u.active ? 'Ativo' : 'Bloqueado' }}</td>
                <td>
                  <button @click="creditarOperador(u)">Adicionar</button>
                  <button class="orange" @click="debitarOperador(u)">Retirar</button>
                  <button class="danger" @click="toggleOperador(u)">
                    {{ u.active ? 'Bloquear' : 'Ativar' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="tab==='statement'">
          <h1>Extrato</h1>

          <table>
            <thead>
              <tr>
                <th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Saldo após</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in statement" :key="t.id">
                <td>{{ t.created_at }}</td>
                <td>{{ t.type }}</td>
                <td>{{ t.description }}</td>
                <td>{{ money(t.amount) }}</td>
                <td>{{ money(t.balance_after) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>

    <div v-if="pixModal.show" class="modal-bg">
      <div class="modal">
        <h2>Pix gerado</h2>
        <p><b>Valor:</b> {{ money(pixModal.value) }}</p>

        <img
          v-if="pixModal.encodedImage"
          class="qr"
          :src="'data:image/png;base64,' + pixModal.encodedImage"
        />

        <label>Pix Copia e Cola</label>
        <textarea readonly v-model="pixModal.payload"></textarea>

        <div class="modal-actions">
          <button @click="copiarPix">Copiar Pix</button>
          <button class="orange" @click="carregar">Já paguei / Atualizar</button>
          <button class="danger" @click="pixModal.show=false">Fechar</button>
        </div>

        <p class="hint">Após pagar, aguarde o webhook confirmar e atualize o saldo.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'

const API = 'https://corepay-8b76.onrender.com'

const email = ref('arthurcesarmaga@gmail.com')
const password = ref('')
const token = ref(localStorage.getItem('token'))
const wallet = ref({})
const error = ref('')
const tab = ref('dashboard')
const operators = ref([])
const statement = ref([])
const newUser = ref({ name: '', email: '', password: '' })

const pixModal = ref({
  show: false,
  value: 0,
  paymentId: '',
  payload: '',
  encodedImage: '',
  expirationDate: ''
})

const auth = () => ({
  headers: { Authorization: `Bearer ${token.value}` }
})

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

async function login() {
  try {
    error.value = ''
    const { data } = await axios.post(`${API}/auth/login`, {
      email: email.value,
      password: password.value
    })

    token.value = data.token
    localStorage.setItem('token', data.token)
    await carregar()
  } catch {
    error.value = 'Login inválido'
  }
}

async function carregar() {
  const { data } = await axios.get(`${API}/wallet/me`, auth())
  wallet.value = data.wallet
  await carregarExtrato()
  if (wallet.value.role === 'admin') await carregarOperadores()
}

async function carregarOperadores() {
  const { data } = await axios.get(`${API}/users`, auth())
  operators.value = data.users
}

async function carregarExtrato() {
  const { data } = await axios.get(`${API}/wallet/statement`, auth())
  statement.value = data.transactions
}

async function criarOperador() {
  await axios.post(`${API}/users`, newUser.value, auth())
  newUser.value = { name: '', email: '', password: '' }
  await carregarOperadores()
}

async function creditarOperador(u) {
  const amount = prompt(`Valor para adicionar em ${u.name}:`)
  if (!amount) return

  await axios.post(`${API}/admin/wallets/${u.id}/credit`, {
    amount,
    description: `Crédito admin para ${u.name}`
  }, auth())

  await carregar()
}

async function debitarOperador(u) {
  const amount = prompt(`Valor para retirar de ${u.name}:`)
  if (!amount) return

  try {
    await axios.post(`${API}/admin/wallets/${u.id}/debit`, {
      amount,
      description: `Débito admin de ${u.name}`
    }, auth())

    await carregar()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao retirar saldo')
  }
}

async function toggleOperador(u) {
  await axios.post(`${API}/admin/users/${u.id}/toggle`, {}, auth())
  await carregarOperadores()
}

async function depositarAsaas() {
  const amount = prompt('Valor para carregar:')
  if (!amount) return

  try {
    const { data } = await axios.post(`${API}/deposits/asaas/pix`, {
      amount
    }, auth())

    pixModal.value = {
      show: true,
      value: data.value,
      paymentId: data.paymentId,
      payload: data.payload,
      encodedImage: data.encodedImage,
      expirationDate: data.expirationDate
    }
  } catch (err) {
    alert(err.response?.data?.error?.errors?.[0]?.description || err.response?.data?.error || 'Erro ao gerar Pix')
  }
}

async function copiarPix() {
  await navigator.clipboard.writeText(pixModal.value.payload)
  alert('Pix copiado.')
}

async function pagar() {
  const amount = prompt('Valor do pagamento:')
  const pix = prompt('Pix copia e cola:')
  if (!amount || !pix) return

  await axios.post(`${API}/payments/manual`, {
    amount,
    pix,
    description: 'Pagamento Pix manual'
  }, auth())

  await carregar()
}

async function sacar() {
  const amount = prompt('Valor do saque:')
  const pixKey = prompt('Chave Pix para saque:')
  if (!amount || !pixKey) return

  try {
    await axios.post(`${API}/withdraw`, {
      amount,
      pixKey
    }, auth())

    alert('Saque registrado com sucesso.')
    await carregar()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao sacar')
  }
}

async function alterarSenha() {
  const currentPassword = prompt('Senha atual:')
  if (!currentPassword) return

  const newPassword = prompt('Nova senha:')
  if (!newPassword) return

  try {
    await axios.post(`${API}/auth/change-password`, {
      currentPassword,
      newPassword
    }, auth())

    alert('Senha alterada com sucesso.')
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao alterar senha')
  }
}

function logout() {
  localStorage.removeItem('token')
  token.value = null
}

if (token.value) carregar()
</script>

<style>
body{margin:0;font-family:Arial;background:#eef1f8;color:#263044}
.page{min-height:100vh}
.login{max-width:360px;margin:80px auto;background:white;padding:32px;border-radius:20px;display:flex;flex-direction:column;gap:14px}
input{padding:13px;border-radius:10px;border:1px solid #d7dbe8}
button{padding:13px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:bold;cursor:pointer}
.orange{background:#e86f1f}.danger{background:#d93030}
.layout{display:flex;min-height:100vh}
aside{width:230px;background:#172033;color:white;padding:25px;display:flex;flex-direction:column;gap:12px}
aside button{background:#2c3956;text-align:left}
main{flex:1;padding:32px}
.cards{display:flex;gap:20px;margin:20px 0}
.card{flex:1;background:white;padding:24px;border-radius:18px;box-shadow:0 8px 20px #0001}
.card span{display:block;color:#667;margin-bottom:10px}
.card strong{font-size:25px}
.actions,.form{display:flex;gap:12px;margin:20px 0;flex-wrap:wrap}
table{width:100%;border-collapse:collapse;background:white;border-radius:16px;overflow:hidden}
th,td{padding:14px;border-bottom:1px solid #e6e8f0;text-align:left}
td button{margin-right:6px;margin-bottom:6px}
.error{color:red}
.modal-bg{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:1000}
.modal{background:white;width:420px;max-width:90vw;border-radius:20px;padding:25px;box-shadow:0 20px 60px #0005}
.qr{display:block;width:260px;height:260px;margin:15px auto;border:1px solid #ddd;border-radius:12px}
textarea{width:100%;height:120px;border:1px solid #d7dbe8;border-radius:10px;padding:10px;margin-top:8px;resize:none}
.modal-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}
.hint{font-size:13px;color:#667}
</style>
'@ | Set-Content .\src\App.vue -Encoding utf8