<template>
  <div class="page">
    <div v-if="!token" class="login">
      <h1>CorePay</h1>
      <input v-model="email" placeholder="E-mail" />
      <input v-model="password" type="password" placeholder="Senha" />
      <button @click="login">Entrar</button>
      <p>{{ error }}</p>
    </div>

    <div v-else class="app">
      <aside>
        <h2>CorePay</h2>
        <button @click="tab='dashboard'">Dashboard</button>
        <button v-if="wallet.role==='admin'" @click="tab='operators'">Operadores</button>
        <button @click="tab='statement'">Extrato</button>
        <button class="danger" @click="logout">Sair</button>
      </aside>

      <main>
        <section v-if="tab==='dashboard'">
          <h1>Dashboard</h1>

          <div class="cards">
            <div class="card">
              <span>Saldo</span>
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

          <div class="buttons">
            <button @click="depositar">Carregar saldo</button>
            <button @click="pagar">Pagar Pix</button>
            <button class="orange" @click="sacar">Sacar</button>
            <button @click="alterarSenha">Alterar senha</button>
          </div>
        </section>

        <section v-if="tab==='operators'">
          <h1>Operadores</h1>

          <div class="form">
            <input v-model="newUser.name" placeholder="Nome" />
            <input v-model="newUser.email" placeholder="E-mail" />
            <input v-model="newUser.password" placeholder="Senha" />
            <button @click="criarOperador">Criar</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Email</th><th>Saldo</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in operators" :key="u.id">
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td>{{ money(u.balance) }}</td>
                <td>{{ u.active ? 'Ativo' : 'Bloqueado' }}</td>
                <td>
                  <button @click="creditar(u)">Adicionar</button>
                  <button class="orange" @click="debitar(u)">Retirar</button>
                  <button class="danger" @click="toggle(u)">
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

    <PixModal
      :show="pix.show"
      :value="pix.value"
      :payload="pix.payload"
      :encodedImage="pix.encodedImage"
      @close="pix.show=false"
      @refresh="carregar"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api, authHeaders } from './services/api'
import PixModal from './components/PixModal.vue'

const email = ref('arthurcesarmaga@gmail.com')
const password = ref('')
const token = ref(localStorage.getItem('token'))
const error = ref('')
const tab = ref('dashboard')

const wallet = ref({})
const operators = ref([])
const statement = ref([])
const newUser = ref({ name:'', email:'', password:'' })

const pix = ref({ show:false, value:0, payload:'', encodedImage:'' })

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
}

async function login() {
  try {
    const { data } = await api.post('/auth/login', { email: email.value, password: password.value })
    token.value = data.token
    localStorage.setItem('token', data.token)
    await carregar()
  } catch {
    error.value = 'Login inválido'
  }
}

async function carregar() {
  const { data } = await api.get('/wallet/me', authHeaders())
  wallet.value = data.wallet
  await carregarExtrato()
  if (wallet.value.role === 'admin') await carregarOperadores()
}

async function carregarOperadores() {
  const { data } = await api.get('/users', authHeaders())
  operators.value = data.users
}

async function carregarExtrato() {
  const { data } = await api.get('/wallet/statement', authHeaders())
  statement.value = data.transactions
}

async function depositar() {
  const amount = prompt('Valor para carregar:')
  if (!amount) return

  try {
    const { data } = await api.post('/deposits/asaas/pix', { amount }, authHeaders())
    pix.value = {
      show: true,
      value: data.value,
      payload: data.payload,
      encodedImage: data.encodedImage
    }
  } catch (err) {
    alert(err.response?.data?.error?.errors?.[0]?.description || err.response?.data?.error || 'Erro ao gerar Pix')
  }
}

async function pagar() {
  const amount = prompt('Valor do pagamento:')
  const pixCode = prompt('Pix copia e cola:')
  if (!amount || !pixCode) return

  await api.post('/payments/manual', { amount, pix: pixCode, description:'Pagamento Pix manual' }, authHeaders())
  await carregar()
}

async function sacar() {
  const amount = prompt('Valor do saque:')
  const pixKey = prompt('Chave Pix:')
  if (!amount || !pixKey) return

  try {
    await api.post('/withdraw', { amount, pixKey }, authHeaders())
    alert('Saque registrado.')
    await carregar()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao sacar')
  }
}

async function alterarSenha() {
  const currentPassword = prompt('Senha atual:')
  const newPassword = prompt('Nova senha:')
  if (!currentPassword || !newPassword) return

  try {
    await api.post('/auth/change-password', { currentPassword, newPassword }, authHeaders())
    alert('Senha alterada.')
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao alterar senha')
  }
}

async function criarOperador() {
  await api.post('/users', newUser.value, authHeaders())
  newUser.value = { name:'', email:'', password:'' }
  await carregarOperadores()
}

async function creditar(u) {
  const amount = prompt(`Adicionar saldo para ${u.name}:`)
  if (!amount) return

  await api.post(`/admin/wallets/${u.id}/credit`, { amount, description:`Crédito admin para ${u.name}` }, authHeaders())
  await carregar()
}

async function debitar(u) {
  const amount = prompt(`Retirar saldo de ${u.name}:`)
  if (!amount) return

  try {
    await api.post(`/admin/wallets/${u.id}/debit`, { amount, description:`Débito admin de ${u.name}` }, authHeaders())
    await carregar()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao retirar saldo')
  }
}

async function toggle(u) {
  await api.post(`/admin/users/${u.id}/toggle`, {}, authHeaders())
  await carregarOperadores()
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
button{padding:12px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:bold;cursor:pointer;margin:2px}
.orange{background:#e86f1f}.danger{background:#d93030}
.app{display:flex;min-height:100vh}
aside{width:230px;background:#172033;color:white;padding:25px;display:flex;flex-direction:column;gap:12px}
aside button{background:#2c3956;text-align:left}
main{flex:1;padding:32px}
.cards{display:flex;gap:20px;margin:20px 0}
.card{flex:1;background:white;padding:24px;border-radius:18px;box-shadow:0 8px 20px #0001}
.card span{display:block;color:#667;margin-bottom:10px}
.card strong{font-size:25px}
.buttons,.form{display:flex;gap:10px;margin:20px 0;flex-wrap:wrap}
table{width:100%;border-collapse:collapse;background:white;border-radius:16px;overflow:hidden}
th,td{padding:14px;border-bottom:1px solid #e6e8f0;text-align:left}
.error{color:red}
</style>
