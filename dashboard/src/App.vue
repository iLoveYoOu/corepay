<template>
  <div class="page">
    <div v-if="!token" class="login">
      <h1>CorePay</h1>
      <p>Entre com seu usuÃ¡rio e senha</p>

      <input v-model="email" placeholder="E-mail" />
      <input v-model="password" type="password" placeholder="Senha" />

      <button @click="login">Entrar</button>

      <p class="error">{{ error }}</p>
    </div>

    <div v-else class="layout">
      <aside>
        <h2>CorePay</h2>

        <button @click="tab='dashboard'">Dashboard</button>
        <button v-if="wallet.role === 'admin'" @click="openOperators">Operadores</button>
        <button @click="openStatement">Extrato</button>

        <div class="spacer"></div>

        <button class="danger" @click="logout">Sair</button>
      </aside>

      <main>
        <section v-if="tab === 'dashboard'">
          <h1>Dashboard</h1>

          <div class="cards">
            <div class="card">
              <span>Saldo disponÃ­vel</span>
              <strong>{{ money(wallet.balance) }}</strong>
            </div>

            <div class="card">
              <span>UsuÃ¡rio</span>
              <strong>{{ wallet.name }}</strong>
            </div>

            <div class="card">
              <span>Perfil</span>
              <strong>{{ wallet.role }}</strong>
            </div>
          </div>

          <div class="actions">
            <button @click="depositar">Carregar saldo</button>
            <button @click="pagar">Pagar Pix</button>
            <button class="orange">Sacar</button>
            <button class="gray">Alterar senha</button>
          </div>
        </section>

        <section v-if="tab === 'operators'">
          <div class="header-row">
            <h1>Operadores</h1>
            <button @click="showCreate = !showCreate">
              {{ showCreate ? 'Fechar' : '+ Novo operador' }}
            </button>
          </div>

          <div v-if="showCreate" class="panel">
            <h3>Novo operador</h3>

            <div class="form">
              <input v-model="newUser.name" placeholder="Nome">
              <input v-model="newUser.email" placeholder="E-mail">
              <input v-model="newUser.password" placeholder="Senha">
              <button @click="criarOperador">Criar operador</button>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Saldo</th>
                <th>Status</th>
                <th>AÃ§Ãµes</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="u in operators" :key="u.id">
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td>{{ money(u.balance) }}</td>
                <td>
                  <span :class="u.active ? 'status-ok' : 'status-bad'">
                    {{ u.active ? 'Ativo' : 'Bloqueado' }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button class="small" @click="editarOperador(u)">Editar</button>
                  <button class="small green" @click="ajustarSaldo(u, 'credit')">+ Saldo</button>
                  <button class="small orange" @click="ajustarSaldo(u, 'debit')">- Saldo</button>
                  <button class="small gray" @click="toggleOperador(u)">
                    {{ u.active ? 'Bloquear' : 'Desbloquear' }}
                  </button>
                  <button class="small" @click="verExtratoOperador(u)">Extrato</button>
                  <button class="small danger" @click="excluirOperador(u)">Excluir</button>
                </td>
              </tr>

              <tr v-if="operators.length === 0">
                <td colspan="5">Nenhum operador cadastrado.</td>
              </tr>
            </tbody>
          </table>

          <div v-if="operatorStatementUser" class="panel">
            <div class="header-row">
              <h3>Extrato de {{ operatorStatementUser.name }}</h3>
              <button class="gray" @click="operatorStatementUser=null">Fechar</button>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>DescriÃ§Ã£o</th>
                  <th>Valor</th>
                  <th>Saldo apÃ³s</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="t in operatorStatement" :key="t.id">
                  <td>{{ t.created_at }}</td>
                  <td>{{ t.type }}</td>
                  <td>{{ t.description }}</td>
                  <td>{{ money(t.amount) }}</td>
                  <td>{{ money(t.balance_after) }}</td>
                </tr>

                <tr v-if="operatorStatement.length === 0">
                  <td colspan="5">Sem movimentaÃ§Ãµes.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="tab === 'statement'">
          <h1>Meu extrato</h1>

          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>DescriÃ§Ã£o</th>
                <th>Valor</th>
                <th>Saldo apÃ³s</th>
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

              <tr v-if="statement.length === 0">
                <td colspan="5">Sem movimentaÃ§Ãµes.</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'

const API = 'http://localhost:4000'

const email = ref('admin@corepay.local')
const password = ref('123456')
const token = ref(localStorage.getItem('token'))

const wallet = ref({})
const error = ref('')
const tab = ref('dashboard')

const operators = ref([])
const statement = ref([])

const showCreate = ref(false)
const newUser = ref({
  name: '',
  email: '',
  password: ''
})

const operatorStatementUser = ref(null)
const operatorStatement = ref([])

const auth = () => ({
  headers: {
    Authorization: `Bearer ${token.value}`
  }
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
    error.value = 'Login invÃ¡lido'
  }
}

async function carregar() {
  const { data } = await axios.get(`${API}/wallet/me`, auth())
  wallet.value = data.wallet

  await carregarExtrato()

  if (wallet.value.role === 'admin') {
    await carregarOperadores()
  }
}

async function carregarOperadores() {
  const { data } = await axios.get(`${API}/users`, auth())
  operators.value = data.users
}

async function carregarExtrato() {
  const { data } = await axios.get(`${API}/wallet/statement`, auth())
  statement.value = data.transactions
}

async function openOperators() {
  tab.value = 'operators'
  await carregarOperadores()
}

async function openStatement() {
  tab.value = 'statement'
  await carregarExtrato()
}

async function criarOperador() {
  if (!newUser.value.name || !newUser.value.email || !newUser.value.password) {
    alert('Preencha nome, e-mail e senha.')
    return
  }

  try {
    await axios.post(`${API}/users`, newUser.value, auth())

    newUser.value = {
      name: '',
      email: '',
      password: ''
    }

    showCreate.value = false
    await carregarOperadores()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao criar operador.')
  }
}

async function editarOperador(u) {
  const name = prompt('Nome:', u.name)
  if (!name) return

  const email = prompt('E-mail:', u.email)
  if (!email) return

  const password = prompt('Nova senha em branco mantÃ©m a atual:')

  try {
    await axios.put(`${API}/users/${u.id}`, {
      name,
      email,
      password: password || ''
    }, auth())

    await carregarOperadores()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao editar operador.')
  }
}

async function ajustarSaldo(u, type) {
  const label = type === 'credit' ? 'Adicionar saldo' : 'Retirar saldo'
  const amount = prompt(`${label} para ${u.name}:`)

  if (!amount) return

  const description = prompt('DescriÃ§Ã£o:', type === 'credit' ? 'CrÃ©dito admin' : 'Retirada admin') || ''

  try {
    await axios.post(`${API}/users/${u.id}/balance`, {
      amount,
      type,
      description
    }, auth())

    await carregarOperadores()
    await carregar()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao ajustar saldo.')
  }
}

async function toggleOperador(u) {
  const acao = u.active ? 'bloquear' : 'desbloquear'

  if (!confirm(`Deseja ${acao} ${u.name}?`)) return

  try {
    await axios.patch(`${API}/users/${u.id}/toggle`, {}, auth())
    await carregarOperadores()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao alterar status.')
  }
}

async function excluirOperador(u) {
  if (!confirm(`Excluir ${u.name}?\n\nO acesso serÃ¡ bloqueado, mas o histÃ³rico serÃ¡ preservado.`)) return

  try {
    await axios.delete(`${API}/users/${u.id}`, auth())
    await carregarOperadores()
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao excluir operador.')
  }
}

async function verExtratoOperador(u) {
  try {
    const { data } = await axios.get(`${API}/users/${u.id}/statement`, auth())
    operatorStatementUser.value = u
    operatorStatement.value = data.transactions
  } catch (err) {
    alert(err.response?.data?.error || 'Erro ao carregar extrato.')
  }
}

async function depositar() {
  const amount = prompt('Valor para carregar:')
  if (!amount) return

  await axios.post(`${API}/wallet/deposit`, {
    amount,
    description: 'Carga pelo painel'
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

async function pagar() {
  const pix = prompt('Cole o Pix copia e cola com valor fixo:')
  if (!pix) return

  alert('Parser EMV e Asaas serÃ£o ligados na prÃ³xima etapa.\nPor enquanto o pagamento real ainda nÃ£o foi executado.')
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

if (token.value) {
  carregar()
}
</script>

<style>
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #eef1f8;
  color: #263044;
}

.page {
  min-height: 100vh;
}

.login {
  max-width: 360px;
  margin: 80px auto;
  background: white;
  padding: 32px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 10px 30px #0002;
}

.login h1 {
  margin: 0;
}

input {
  padding: 13px;
  border-radius: 10px;
  border: 1px solid #d7dbe8;
  font-size: 14px;
}

button {
  padding: 13px;
  border: 0;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  font-weight: bold;
  cursor: pointer;
}

button:hover {
  opacity: .9;
}

.green {
  background: #16a34a;
}

.orange {
  background: #ea580c;
}

.gray {
  background: #64748b;
}

.danger {
  background: #dc2626;
}

.layout {
  display: flex;
  min-height: 100vh;
}

aside {
  width: 230px;
  background: #172033;
  color: white;
  padding: 25px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

aside h2 {
  margin-top: 0;
}

aside button {
  background: #2c3956;
  text-align: left;
}

aside .danger {
  background: #dc2626;
}

.spacer {
  flex: 1;
}

main {
  flex: 1;
  padding: 32px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.cards {
  display: flex;
  gap: 20px;
  margin: 20px 0;
}

.card {
  flex: 1;
  background: white;
  padding: 24px;
  border-radius: 18px;
  box-shadow: 0 8px 20px #0001;
}

.card span {
  display: block;
  color: #667;
  margin-bottom: 10px;
}

.card strong {
  font-size: 25px;
}

.actions,
.form {
  display: flex;
  gap: 12px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.panel {
  background: white;
  padding: 20px;
  border-radius: 16px;
  margin: 20px 0;
  box-shadow: 0 8px 20px #0001;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 20px #0001;
}

th,
td {
  padding: 14px;
  border-bottom: 1px solid #e6e8f0;
  text-align: left;
  vertical-align: middle;
}

.actions-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.small {
  padding: 8px 10px;
  font-size: 12px;
}

.status-ok {
  color: #16a34a;
  font-weight: bold;
}

.status-bad {
  color: #dc2626;
  font-weight: bold;
}

.error {
  color: red;
}
</style>

