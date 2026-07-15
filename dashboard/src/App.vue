<template>
  <div class="page">
    <div v-if="!token" class="login">
      <h1>CorePay</h1>
      <input v-model="email" placeholder="E-mail" />
      <input v-model="password" type="password" placeholder="Senha" />
      <button @click="login">Entrar</button>
      <p class="error">{{ error }}</p>
    </div>

    <div v-else class="app">
      <aside>
        <h2>CorePay</h2>

        <button @click="tab='dashboard'">
          Dashboard
        </button>

        <button @click="abrirTesouraria">
          Tesouraria
        </button>

        <button
          v-if="['admin','super_admin'].includes(wallet.role)"
          @click="tab='directory'"
        >
          Administração
        </button>

        <button
          v-if="['admin','super_admin'].includes(wallet.role)"
          @click="tab='operators'"
        >
          Operadores
        </button>

        <button @click="tab='statement'">
          Extrato
        </button>

        <button class="danger" @click="logout">
          Sair
        </button>
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

          <div v-if="treasury.day" class="cards">
            <div class="card">
              <span>Capital disponível</span>
              <strong>
                {{ money(treasury.totals.capitalAvailable) }}
              </strong>
            </div>

            <div class="card">
              <span>Capital nos bancos</span>
              <strong>
                {{ money(treasury.totals.bankBalance) }}
              </strong>
            </div>

            <div class="card">
              <span>Capital controlado</span>
              <strong>
                {{ money(treasury.totals.controlledCapital) }}
              </strong>
            </div>
          </div>

          <div class="buttons">
            <button @click="depositar">
              Carregar saldo
            </button>

            <button @click="pagar">
              Pagar Pix
            </button>

            <button class="orange" @click="sacar">
              Sacar
            </button>

            <button @click="alterarSenha">
              Alterar senha
            </button>
          </div>
        </section>

        <section v-if="tab==='treasury'">
          <div class="treasury-header">
            <div>
              <h1>Tesouraria</h1>

              <p class="muted">
                Controle manual. Os valores não representam
                consulta em tempo real aos bancos.
              </p>
            </div>

            <button @click="carregarTesouraria">
              Atualizar
            </button>
          </div>

          <div v-if="!treasury.context.active" class="notice">
            Operação fechada entre 03:00 e 08:29.
            Os lançamentos ficam disponíveis a partir das 08:30.
          </div>

          <div
            v-if="treasury.context.active && !treasury.day"
            class="opening-panel"
          >
            <h2>Abrir dia operacional</h2>

            <p>
              {{ treasury.context.operationCode }}
              — 08:30 até 03:00 do dia seguinte
            </p>

            <label>Capital inicial total</label>

            <input
              v-model="opening.capitalInitial"
              placeholder="Ex.: 22000"
            />

            <h3>Saldos iniciais nos bancos</h3>

            <p class="muted">
              Preencha somente os bancos que já possuem dinheiro
              no início do turno.
            </p>

            <div class="opening-banks">
              <label
                v-for="bank in treasury.banks"
                :key="bank.code"
              >
                <span>{{ bank.name }}</span>

                <input
                  v-model="opening.balances[bank.code]"
                  placeholder="0,00"
                />
              </label>
            </div>

            <button @click="abrirDia">
              Iniciar dia operacional
            </button>
          </div>

          <div v-if="treasury.day">
            <div class="operation-bar">
              <div>
                <strong>
                  {{ treasury.day.operationCode }}
                </strong>

                <span
                  :class="[
                    'status-pill',
                    treasury.day.status
                  ]"
                >
                  {{
                    treasury.day.status === 'open'
                      ? 'ABERTO'
                      : 'FECHADO'
                  }}
                </span>
              </div>

              <div
                v-if="
                  wallet.role === 'admin' &&
                  treasury.day.status === 'open'
                "
              >
                <button
                  class="danger"
                  @click="fecharDia"
                >
                  Fechar dia
                </button>
              </div>
            </div>

            <div class="cards treasury-summary">
              <div class="card">
                <span>Capital inicial</span>
                <strong>
                  {{ money(treasury.day.capitalInitial) }}
                </strong>
              </div>

              <div class="card">
                <span>Capital disponível</span>
                <strong>
                  {{ money(treasury.totals.capitalAvailable) }}
                </strong>
              </div>

              <div class="card">
                <span>Nos bancos</span>
                <strong>
                  {{ money(treasury.totals.bankBalance) }}
                </strong>
              </div>

              <div class="card">
                <span>Total controlado</span>
                <strong>
                  {{ money(treasury.totals.controlledCapital) }}
                </strong>
              </div>

              <div class="card">
                <span>Depositado hoje</span>
                <strong>
                  {{ money(treasury.totals.depositedToday) }}
                </strong>
              </div>

              <div class="card">
                <span>Sacado hoje</span>
                <strong>
                  {{ money(treasury.totals.withdrawnToday) }}
                </strong>
              </div>
            </div>

            <div class="bank-grid">
              <article
                v-for="bank in treasury.banks"
                :key="bank.code"
                class="bank-card"
              >
                <span class="bank-name">
                  {{ bank.name }}
                </span>

                <strong>
                  {{ money(bank.balance) }}
                </strong>

                <small>
                  Inicial:
                  {{ money(bank.openingBalance) }}
                </small>

                <div class="bank-actions">
                  <button
                    :disabled="
                      treasury.day.status !== 'open' ||
                      !treasury.context.active
                    "
                    @click="movimentar(bank, 'deposit')"
                  >
                    Depositei
                  </button>

                  <button
                    class="orange"
                    :disabled="
                      treasury.day.status !== 'open' ||
                      !treasury.context.active
                    "
                    @click="movimentar(bank, 'withdraw')"
                  >
                    Saquei
                  </button>
                </div>
              </article>
            </div>

            <h2>Lançamentos do dia</h2>

            <table>
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Operador</th>
                  <th>Banco</th>
                  <th>Movimento</th>
                  <th>Valor</th>
                  <th>Capital após</th>
                  <th>Saldo banco</th>
                  <th>Observação</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="movement in treasury.transactions"
                  :key="movement.id"
                >
                  <td>
                    {{ formatDate(movement.createdAt) }}
                  </td>

                  <td>{{ movement.operatorName }}</td>
                  <td>{{ bankName(movement.bank) }}</td>

                  <td>
                    {{
                      movement.type === 'deposit'
                        ? 'Depósito'
                        : movement.type === 'withdraw'
                          ? 'Saque'
                          : 'Saldo inicial'
                    }}
                  </td>

                  <td>{{ money(movement.amount) }}</td>

                  <td>
                    {{ money(movement.capitalAfter) }}
                  </td>

                  <td>
                    {{ money(movement.bankAfter) }}
                  </td>

                  <td>{{ movement.note || '-' }}</td>
                </tr>

                <tr v-if="!treasury.transactions.length">
                  <td colspan="8">
                    Nenhum lançamento realizado.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 class="history-title">
            Histórico de dias operacionais
          </h2>

          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Status</th>
                <th>Capital inicial</th>
                <th>Disponível</th>
                <th>Bancos</th>
                <th>Total controlado</th>
                <th>Aberto por</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="day in treasuryHistory"
                :key="day.id"
              >
                <td>{{ day.operationCode }}</td>
                <td>{{ day.status }}</td>
                <td>{{ money(day.capitalInitial) }}</td>
                <td>{{ money(day.capitalAvailable) }}</td>
                <td>{{ money(day.bankBalance) }}</td>
                <td>{{ money(day.controlledCapital) }}</td>
                <td>{{ day.openedBy }}</td>
              </tr>
            </tbody>
          </table>
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
                <th>Nome</th>
                <th>Email</th>
                <th>Saldo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="u in operators" :key="u.id">
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td>{{ money(u.balance) }}</td>
                <td>{{ u.active ? 'Ativo' : 'Bloqueado' }}</td>

                <td>
                  <button @click="creditar(u)">
                    Adicionar
                  </button>

                  <button class="orange" @click="debitar(u)">
                    Retirar
                  </button>

                  <button class="danger" @click="toggle(u)">
                    {{ u.active ? 'Bloquear' : 'Ativar' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="tab==='directory'">
          <DirectoryPanel />
        </section>

        <section v-if="tab==='statement'">
          <h1>Extrato</h1>

          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Saldo após</th>
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
import DirectoryPanel from './components/DirectoryPanel.vue'

const email = ref('arthurcesarmaga@gmail.com')
const password = ref('')
const token = ref(localStorage.getItem('token'))
const error = ref('')
const tab = ref('dashboard')

const wallet = ref({})
const operators = ref([])
const statement = ref([])
const newUser = ref({
  name: '',
  email: '',
  password: ''
})

const pix = ref({
  show: false,
  value: 0,
  payload: '',
  encodedImage: ''
})

const treasury = ref({
  context: {
    active: false,
    operationCode: null
  },
  day: null,
  banks: [],
  transactions: [],
  totals: {
    bankBalance: 0,
    capitalAvailable: 0,
    controlledCapital: 0,
    depositedToday: 0,
    withdrawnToday: 0
  }
})

const treasuryHistory = ref([])

const opening = ref({
  capitalInitial: '',
  balances: {
    pagbank: '',
    inter: '',
    mercado_pago: '',
    neon: '',
    bradesco: '',
    next: ''
  }
})

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatDate(value) {
  if (!value) return '-'

  return new Date(
    String(value).replace(' ', 'T') + 'Z'
  ).toLocaleString('pt-BR')
}

function bankName(code) {
  return treasury.value.banks.find(
    bank => bank.code === code
  )?.name || code
}

async function login() {
  try {
    const { data } = await api.post('/auth/login', {
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
  const { data } = await api.get(
    '/wallet/me',
    authHeaders()
  )

  wallet.value = data.wallet

  await Promise.all([
    carregarExtrato(),
    carregarTesouraria(),
    carregarHistoricoTesouraria()
  ])

  if (['admin', 'super_admin'].includes(wallet.value.role)) {
    await carregarOperadores()
  }
}

async function abrirTesouraria() {
  tab.value = 'treasury'

  await Promise.all([
    carregarTesouraria(),
    carregarHistoricoTesouraria()
  ])
}

async function carregarTesouraria() {
  try {
    const { data } = await api.get(
      '/treasury/today',
      authHeaders()
    )

    treasury.value = data
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao carregar a tesouraria.'
    )
  }
}

async function carregarHistoricoTesouraria() {
  try {
    const { data } = await api.get(
      '/treasury/history?limit=30',
      authHeaders()
    )

    treasuryHistory.value = data.days || []
  } catch {
    treasuryHistory.value = []
  }
}

async function abrirDia() {
  try {
    const { data } = await api.post(
      '/treasury/open',
      {
        capitalInitial: opening.value.capitalInitial,
        openingBalances: opening.value.balances
      },
      authHeaders()
    )

    treasury.value = data

    opening.value = {
      capitalInitial: '',
      balances: {
        pagbank: '',
        inter: '',
        mercado_pago: '',
        neon: '',
        bradesco: '',
        next: ''
      }
    }

    await carregarHistoricoTesouraria()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao abrir o dia operacional.'
    )
  }
}

async function movimentar(bank, type) {
  const label =
    type === 'deposit'
      ? 'depositado no'
      : 'sacado do'

  const amount = prompt(
    `Valor ${label} ${bank.name}:`
  )

  if (!amount) return

  const note = prompt(
    'Observação opcional:'
  ) || ''

  try {
    const { data } = await api.post(
      '/treasury/movement',
      {
        bank: bank.code,
        type,
        amount,
        note
      },
      authHeaders()
    )

    treasury.value = data

    await carregarHistoricoTesouraria()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao registrar o lançamento.'
    )
  }
}

async function fecharDia() {
  const confirmed = confirm(
    'Confirma o fechamento deste dia operacional?'
  )

  if (!confirmed) return

  try {
    const { data } = await api.post(
      '/treasury/close',
      {
        operationDate:
          treasury.value.day.operationDate
      },
      authHeaders()
    )

    treasury.value = data

    await carregarHistoricoTesouraria()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao fechar o dia.'
    )
  }
}

async function carregarOperadores() {
  const { data } = await api.get(
    '/users',
    authHeaders()
  )

  operators.value = data.users
}

async function carregarExtrato() {
  const { data } = await api.get(
    '/wallet/statement',
    authHeaders()
  )

  statement.value = data.transactions
}

async function depositar() {
  const amount = prompt('Valor para carregar:')
  if (!amount) return

  try {
    const { data } = await api.post(
      '/deposits/mercadopago/pix',
      { amount },
      authHeaders()
    )

    pix.value = {
      show: true,
      value: data.value,
      payload: data.payload,
      encodedImage: data.encodedImage
    }

    acompanharPagamentoMercadoPago(data.paymentId)
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao gerar Pix Mercado Pago'
    )
  }
}

async function acompanharPagamentoMercadoPago(paymentId) {
  if (!paymentId) return

  let attempts = 0
  const maxAttempts = 120

  const timer = setInterval(async () => {
    attempts++

    try {
      const { data } = await api.get(
        `/deposits/mercadopago/${paymentId}/status`,
        authHeaders()
      )

      if (data.approved || data.credited) {
        clearInterval(timer)
        pix.value.show = false
        alert('Pagamento confirmado e saldo creditado.')
        await carregar()
        return
      }
    } catch (err) {
      console.error(
        'Erro ao consultar Pix Mercado Pago:',
        err
      )
    }

    if (attempts >= maxAttempts) {
      clearInterval(timer)
    }
  }, 5000)
}

async function pagar() {
  const amount = prompt('Valor do pagamento:')
  const pixCode = prompt('Pix copia e cola:')

  if (!amount || !pixCode) return

  await api.post(
    '/payments/manual',
    {
      amount,
      pix: pixCode,
      description: 'Pagamento Pix manual'
    },
    authHeaders()
  )

  await carregar()
}

async function sacar() {
  const amount = prompt('Valor do saque:')
  const pixKey = prompt('Chave Pix:')

  if (!amount || !pixKey) return

  try {
    await api.post(
      '/withdraw',
      { amount, pixKey },
      authHeaders()
    )

    alert('Saque registrado.')

    await carregar()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao sacar'
    )
  }
}

async function alterarSenha() {
  const currentPassword = prompt('Senha atual:')
  const newPassword = prompt('Nova senha:')

  if (!currentPassword || !newPassword) return

  try {
    await api.post(
      '/auth/change-password',
      {
        currentPassword,
        newPassword
      },
      authHeaders()
    )

    alert('Senha alterada.')
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao alterar senha'
    )
  }
}

async function criarOperador() {
  await api.post(
    '/users',
    newUser.value,
    authHeaders()
  )

  newUser.value = {
    name: '',
    email: '',
    password: ''
  }

  await carregarOperadores()
}

async function creditar(user) {
  const amount = prompt(
    `Adicionar saldo para ${user.name}:`
  )

  if (!amount) return

  await api.post(
    `/admin/wallets/${user.id}/credit`,
    {
      amount,
      description:
        `Crédito admin para ${user.name}`
    },
    authHeaders()
  )

  await carregar()
}

async function debitar(user) {
  const amount = prompt(
    `Retirar saldo de ${user.name}:`
  )

  if (!amount) return

  try {
    await api.post(
      `/admin/wallets/${user.id}/debit`,
      {
        amount,
        description:
          `Débito admin de ${user.name}`
      },
      authHeaders()
    )

    await carregar()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao retirar saldo'
    )
  }
}

async function toggle(user) {
  await api.post(
    `/admin/users/${user.id}/toggle`,
    {},
    authHeaders()
  )

  await carregarOperadores()
}

function logout() {
  localStorage.removeItem('token')
  token.value = null
}

if (token.value) {
  carregar()
}
</script>
