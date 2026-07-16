<template>
  <div class="page">
    <form v-if="!token" class="login" @submit.prevent="login">
      <div class="login-brand">CorePay</div>
      <h1>Bem-vindo</h1>
      <p class="login-copy">Entre para acessar sua operação.</p>
      <label>
        E-mail
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="seu@email.com"
        />
      </label>
      <label>
        Senha
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Sua senha"
        />
      </label>
      <button type="submit" :disabled="authLoading">
        {{ authLoading ? 'Entrando...' : 'Entrar' }}
      </button>
      <p class="error">{{ error }}</p>
    </form>

    <div v-else class="app">
      <aside>
        <h2>CorePay</h2>

        <button
          :class="{ active: tab === 'dashboard' }"
          @click="tab='dashboard'"
        >
          Dashboard
        </button>

        <button
          :class="{ active: tab === 'treasury' }"
          @click="abrirTesouraria"
        >
          Tesouraria
        </button>

        <button
          :class="{ active: tab === 'banking' }"
          @click="tab='banking'"
        >
          Operação Bancária
        </button>

        <button
          v-if="['admin','super_admin'].includes(wallet.role)"
          :class="{ active: tab === 'directory' }"
          @click="tab='directory'"
        >
          Administração
        </button>

        <button
          :class="{ active: tab === 'statement' }"
          @click="tab='statement'"
        >
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
            <button @click="showPasswordChange=true">
              Alterar senha
            </button>
          </div>
        </section>

        <section v-if="tab==='banking'">
          <BankOperations />
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
                  ['admin', 'super_admin'].includes(wallet.role) &&
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

    <div
      v-if="showPasswordChange"
      class="modal-backdrop"
      @click.self="cancelPasswordChange"
    >
      <form class="password-modal" @submit.prevent="alterarSenha">
        <h2>Alterar minha senha</h2>

        <label>
          Senha atual
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <label>
          Nova senha
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <label>
          Confirmar nova senha
          <input
            v-model="newPasswordConfirmation"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <div class="modal-actions">
          <button type="button" @click="cancelPasswordChange">
            Cancelar
          </button>
          <button class="orange" type="submit">
            Salvar senha
          </button>
        </div>
      </form>
    </div>

  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api, authHeaders } from './services/api'
import DirectoryPanel from './components/DirectoryPanel.vue'
import BankOperations from './components/BankOperations.vue'

const email = ref('')
const password = ref('')
const token = ref(localStorage.getItem('token'))
const error = ref('')
const authLoading = ref(false)
const tab = ref('dashboard')
const showPasswordChange = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')

const wallet = ref({})
const statement = ref([])

function emptyTreasury() {
  return {
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
  }
}

const treasury = ref(emptyTreasury())

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
  if (authLoading.value) return

  error.value = ''
  authLoading.value = true

  try {
    const { data } = await api.post('/auth/login', {
      email: email.value,
      password: password.value
    })

    localStorage.setItem('token', data.token)
    await carregar()
    token.value = data.token
    password.value = ''
  } catch (err) {
    clearSession()
    error.value =
      err.response?.data?.error ||
      'Não foi possível entrar.'
  } finally {
    authLoading.value = false
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

async function carregarExtrato() {
  const { data } = await api.get(
    '/wallet/statement',
    authHeaders()
  )

  statement.value = data.transactions
}

async function alterarSenha() {
  if (newPassword.value.length < 8) {
    alert('A nova senha deve ter pelo menos 8 caracteres.')
    return
  }

  if (newPassword.value !== newPasswordConfirmation.value) {
    alert('As novas senhas não conferem.')
    return
  }

  try {
    const { data } = await api.post(
      '/auth/change-password',
      {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value
      },
      authHeaders()
    )

    if (data.token) {
      localStorage.setItem('token', data.token)
      token.value = data.token
    }

    cancelPasswordChange()
    alert('Senha alterada.')
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao alterar senha'
    )
  }
}

function clearSession(message = '') {
  localStorage.removeItem('token')
  token.value = null
  wallet.value = {}
  statement.value = []
  treasury.value = emptyTreasury()
  treasuryHistory.value = []
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
  tab.value = 'dashboard'
  password.value = ''
  cancelPasswordChange()

  if (message) {
    error.value = message
  }
}

function cancelPasswordChange() {
  showPasswordChange.value = false
  currentPassword.value = ''
  newPassword.value = ''
  newPasswordConfirmation.value = ''
}

function logout() {
  clearSession()
  error.value = ''
}

function handleUnauthorized() {
  clearSession('Sua sessão expirou. Entre novamente.')
}

onMounted(async () => {
  window.addEventListener(
    'corepay:unauthorized',
    handleUnauthorized
  )

  if (!token.value) return

  authLoading.value = true

  try {
    await carregar()
  } catch (err) {
    if (err.response?.status !== 401) {
      clearSession(
        'Não foi possível restaurar sua sessão.'
      )
    }
  } finally {
    authLoading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener(
    'corepay:unauthorized',
    handleUnauthorized
  )
})
</script>
