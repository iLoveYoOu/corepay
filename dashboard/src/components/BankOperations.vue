<template>
  <div class="bank-ops">
    <header class="hero">
      <div>
        <span class="eyebrow">CONTROLE OPERACIONAL</span>
        <h1>Meia do Lucao</h1>
        <p>
          Organize os bancos do turno, registre entradas e saídas
          de créditos e descubra o repasse do fechamento.
        </p>
      </div>

      <div class="hero-actions">
        <button
          class="blue"
          :disabled="refreshing || actionBusy"
          @click="load"
        >
          {{ refreshing ? 'Atualizando...' : 'Atualizar' }}
        </button>
        <button
          v-if="state.day?.status === 'open'"
          class="orange"
          :disabled="actionBusy"
          @click="showClose = !showClose"
        >
          Fechar dia
        </button>
      </div>
    </header>

    <div class="notice">
      <strong>Controle manual:</strong>
      confirme cada movimentação de créditos somente depois de conferir no aplicativo do banco.
    </div>

    <section v-if="loading" class="panel empty">
      Carregando operação...
    </section>

    <section v-else-if="!state.day" class="panel opening">
      <div class="section-title">
        <div>
          <span class="eyebrow">INÍCIO DO TURNO</span>
          <h2>Quais bancos você vai usar hoje?</h2>
        </div>
        <span class="date-chip">{{ state.operationDate }}</span>
      </div>

      <div class="account-editor">
        <div
          v-for="(account, index) in draftAccounts"
          :key="index"
          class="draft-card"
        >
          <div class="draft-number">{{ index + 1 }}</div>

          <label>
            Banco ou apelido
            <input
              v-model="account.name"
              placeholder="Ex.: Inter Recebimentos"
            />
          </label>

          <label>
            Finalidade
            <select v-model="account.purpose">
              <option value="both">Pagar e Receber</option>
              <option value="pay">Pagar</option>
            </select>
          </label>

          <label>
            Saldo inicial
            <input
              v-model="account.openingBalance"
              inputmode="decimal"
              placeholder="0,00"
            />
          </label>

          <button
            v-if="draftAccounts.length > 1"
            class="icon danger"
            title="Remover banco"
            :disabled="actionBusy"
            @click="draftAccounts.splice(index, 1)"
          >
            ×
          </button>
        </div>
      </div>

      <div class="opening-footer">
        <div class="opening-total">
          <span>Saldo inicial informado</span>
          <strong>{{ money(draftTotal) }}</strong>
        </div>

        <div class="button-row">
          <button
            class="soft"
            :disabled="actionBusy"
            @click="addDraft"
          >
            +Bancos
          </button>
          <button
            class="blue"
            :disabled="actionBusy"
            @click="openDay"
          >
            {{ pendingAction === 'open' ? 'Iniciando...' : 'Iniciar operação' }}
          </button>
        </div>
      </div>
    </section>

    <template v-else>
      <section class="summary-grid">
        <article class="summary-card violet">
          <span>Saldo inicial</span>
          <strong>{{ money(state.totals.opening) }}</strong>
          <small>Base do turno</small>
        </article>

        <article class="summary-card blue-card">
          <span>Saldo atual</span>
          <strong>{{ money(state.totals.current) }}</strong>
          <small>Soma de todos os bancos</small>
        </article>

        <article class="summary-card green">
          <span>Entradas registradas</span>
          <strong>{{ money(state.totals.entries) }}</strong>
          <small>{{ entryCount }} movimentações</small>
        </article>

        <article class="summary-card orange-card">
          <span>Saídas registradas</span>
          <strong>{{ money(state.totals.exits) }}</strong>
          <small>{{ exitCount }} movimentações</small>
        </article>
      </section>

      <section class="highlight-card">
        <div class="highlight-content">
          <span>Total Lucão Mandar (hoje)</span>
          <strong>{{ money(totalLucaoHoje) }}</strong>
          <small>Valor acumulado dos lançamentos do dia</small>
        </div>
      </section>

      <section
        v-if="state.day.status === 'closed'"
        class="closing-result"
      >
        <div>
          <span>Lucro total</span>
          <strong>{{ money(state.day.profitTotal) }}</strong>
        </div>
        <div>
          <span>Metade do operador</span>
          <strong>{{ money(state.day.operatorShare) }}</strong>
        </div>
        <div>
          <span>Reposição de capital</span>
          <strong>{{ money(state.day.capitalReplacement) }}</strong>
        </div>
        <div class="send-total">
          <span>Lucão deve enviar</span>
          <strong>{{ money(state.day.amountToSend) }}</strong>
        </div>
      </section>

      <section
        v-if="showClose && state.day.status === 'open'"
        class="panel close-panel"
      >
        <div>
          <span class="eyebrow">FECHAMENTO</span>
          <h2>Calcular repasse do dia</h2>
          <p>
            Repasse = reposição do capital + metade do lucro + ajustes.
          </p>
        </div>

        <label>
          Lucro total que caiu para o Lucão
          <input
            v-model="closing.profitTotal"
            inputmode="decimal"
            required
            placeholder="0,00"
          />
        </label>

        <label>
          Ajustes ou tarifas
          <input
            v-model="closing.adjustments"
            inputmode="decimal"
            placeholder="0,00 ou -10,00"
          />
        </label>

        <div class="preview">
          <span>Estimativa de repasse</span>
          <strong>{{ money(closePreview) }}</strong>
        </div>

        <button
          class="orange"
          :disabled="actionBusy || !profitFilled"
          @click="closeDay"
        >
          {{ pendingAction === 'close' ? 'Fechando...' : 'Confirmar fechamento' }}
        </button>
      </section>

      <section class="banks-head">
        <div>
          <span class="eyebrow">BANCOS DO TURNO</span>
          <h2>Créditos operacionais</h2>
        </div>

        <button
          v-if="state.day.status === 'open'"
          class="soft"
          :disabled="actionBusy"
          @click="showNewBank = !showNewBank"
        >
           +Bancos
        </button>
      </section>

      <section
        v-if="showNewBank && state.day.status === 'open'"
        class="panel new-bank"
      >
        <input v-model="newBank.name" placeholder="Nome do banco" />
        <select v-model="newBank.purpose">
          <option value="both">Pagar e Receber</option>
          <option value="pay">Pagar</option>
        </select>
        <input
          v-model="newBank.openingBalance"
          inputmode="decimal"
          placeholder="Créditos iniciais"
        />
        <button
          class="blue"
          :disabled="actionBusy"
          @click="addBank"
        >
          {{ pendingAction === 'bank' ? 'Salvando...' : 'Salvar banco' }}
        </button>
      </section>

      <section class="bank-grid">
        <article
          v-for="account in state.accounts"
          :key="account.id"
          class="bank-card"
        >
          <div class="bank-top">
            <div class="bank-icon">🏦</div>
            <span :class="['purpose', account.purpose]">
              {{ purposeName(account.purpose) }}
            </span>
            <button
              v-if="state.day.status === 'open'"
              class="delete-bank"
              title="Remover banco"
              :disabled="actionBusy"
              @click.stop="removeBank(account)"
            >
              🗑️
            </button>
          </div>

          <h3>{{ account.name }}</h3>
          <strong class="balance">
            {{ money(account.currentBalance) }}
          </strong>
          <small>
            Inicial: {{ money(account.openingBalance) }}
          </small>

          <div
            v-if="state.day.status === 'open'"
            class="bank-actions"
          >
            <button
              v-if="account.purpose !== 'pay'"
              class="green-button"
              :disabled="actionBusy"
              @click="move(account, 'entry')"
            >
              + Recebi
            </button>
            <button
              v-if="account.purpose !== 'receive'"
              class="orange"
              :disabled="actionBusy"
              @click="move(account, 'exit')"
            >
              − Paguei
            </button>
          </div>

        </article>
      </section>

      <section v-if="state.day.status === 'open'" class="panel launch-panel">
        <div class="section-title">
          <div>
            <span class="eyebrow">LANÇAMENTOS</span>
            <h2>{{ editingId ? 'Editar depósito' : 'Registrar depósito' }}</h2>
          </div>
        </div>

        <div class="launch-form">
          <label>
            Casa
            <input v-model="launchForm.casa" placeholder="Nome da casa" />
          </label>

          <label>
            Depósito
            <input v-model="launchForm.deposito" inputmode="decimal" placeholder="0,00" />
          </label>

          <label>
            Saque/Ret
            <input v-model="launchForm.saque" inputmode="decimal" placeholder="0,00" />
          </label>

          <div class="launch-actions">
            <button
              class="blue"
              :disabled="actionBusy"
              @click="launch"
            >
              {{ pendingAction === 'launch' ? 'Lançando...' : (editingId ? 'Salvar' : 'Lançar') }}
            </button>
            <button
              v-if="editingId"
              class="soft"
              :disabled="actionBusy"
              @click="cancelEdit"
            >
              Cancelar
            </button>
          </div>
        </div>

        <div v-if="numberValue(launchForm.deposito)" class="launch-preview">
          <div>
            <span>Banca</span>
            <strong>{{ money(launchCalculos.banca) }}</strong>
          </div>
          <div>
            <span>Lucro Blogueira</span>
            <strong>{{ money(launchCalculos.lucroBlogueira) }}</strong>
          </div>
          <div>
            <span>Mandar Lucão</span>
            <strong>{{ money(launchCalculos.lucao) }}</strong>
          </div>
        </div>

        <div v-if="state.launches.length" class="launches-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Casa</th>
                <th>Depósito</th>
                <th>Banca</th>
                <th>Lucro Blog.</th>
                <th>Mandar Lucão</th>
                <th>Saque/Ret</th>
                <th v-if="state.day.status === 'open'">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in state.launches" :key="l.id">
                <td>{{ formatDate(l.created_at) }}</td>
                <td>{{ l.casa }}</td>
                <td>{{ money(l.deposito) }}</td>
                <td>{{ money(l.banca) }}</td>
                <td>{{ money(l.lucroBlogueira) }}</td>
                <td><strong>{{ money(l.lucao) }}</strong></td>
                <td>{{ l.saque ? money(l.saque) : '—' }}</td>
                <td v-if="state.day.status === 'open'" class="actions-cell">
                  <button
                    class="compact blue"
                    :disabled="actionBusy"
                    @click="editLaunch(l)"
                  >
                    Editar
                  </button>
                  <button
                    class="compact danger"
                    :disabled="actionBusy"
                    @click="deleteLaunch(l)"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="launch-total">
                <td colspan="5">Total Mandar Lucão</td>
                <td><strong>{{ money(totalLucaoHoje) }}</strong></td>
                <td></td>
                <td v-if="state.day.status === 'open'"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>





    </template>

    <section v-if="!loading" class="panel history-panel">
      <div class="section-title">
        <div>
          <span class="eyebrow">HISTÓRICO</span>
          <h2>Fechamentos anteriores</h2>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Operação</th>
              <th>Status</th>
              <th>Inicial</th>
              <th>Final</th>
              <th>Lucro</th>
              <th>Lucão deve enviar</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in state.history" :key="day.id">
              <td>{{ day.operationDate }}</td>
              <td>
                <span :class="['movement', day.status === 'closed' ? 'entry' : 'exit']">
                  {{ day.status === 'closed' ? 'Fechado' : 'Aberto' }}
                </span>
              </td>
              <td>{{ money(day.openingTotal) }}</td>
              <td>
                {{
                  day.closingTotal == null
                    ? '—'
                    : money(day.closingTotal)
                }}
              </td>
              <td>{{ money(day.profitTotal) }}</td>
              <td><strong>{{ money(day.amountToSend) }}</strong></td>
              <td>
                <button
                  v-if="day.status === 'open'"
                  class="orange compact-button"
                  :disabled="actionBusy"
                  @click="resumeDay(day)"
                >
                  Retomar
                </button>
                <span v-else>—</span>
              </td>
            </tr>
            <tr v-if="!state.history.length">
              <td colspan="7" class="empty-row">
                Nenhum fechamento anterior.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api, authHeaders } from '../services/api'

const loading = ref(true)
const refreshing = ref(false)
const pendingAction = ref('')
const showClose = ref(false)
const showNewBank = ref(false)

const state = reactive({
  operationDate: '',
  day: null,
  accounts: [],
  movements: [],
  launches: [],
  totalLucao: 0,
  history: [],
  totals: {
    opening: 0,
    current: 0,
    entries: 0,
    exits: 0
  }
})

const draftAccounts = reactive([
  {
    name: '',
    purpose: 'both',
    openingBalance: ''
  }
])

const newBank = reactive({
  name: '',
  purpose: 'both',
  openingBalance: ''
})

const closing = reactive({
  profitTotal: '',
  adjustments: ''
})

const editingId = ref(null)

const launchForm = reactive({
  casa: '',
  deposito: '',
  saque: ''
})

const lucroTabela = {
  300: 60, 350: 60, 400: 60, 450: 60, 500: 60,
  550: 70, 600: 80, 650: 90, 700: 90, 750: 100,
  800: 100, 850: 110, 900: 110, 950: 120, 1000: 120,
  1050: 125, 1100: 130, 1150: 135, 1200: 140,
  1250: 145, 1300: 150, 1350: 155, 1400: 160,
  1450: 165, 1500: 170, 1600: 190, 1650: 195,
  1700: 200, 1750: 205, 1800: 210, 1850: 215,
  1900: 220, 1950: 225, 2000: 240, 2050: 245,
  2100: 250, 2150: 255, 2200: 260, 2250: 265,
  2300: 270, 2350: 275, 2400: 280, 2450: 285,
  2500: 290, 2600: 310, 2650: 315, 2700: 320,
  2750: 325, 2800: 330, 2850: 335, 2900: 340,
  2950: 345, 3000: 360
}

function calcularLucro(deposito) {
  const valores = Object.keys(lucroTabela).map(Number).sort((a, b) => a - b)
  let lucro = 0
  for (const valor of valores) {
    if (deposito >= valor) lucro = lucroTabela[valor]
  }
  return lucro
}

const launchCalculos = computed(() => {
  const deposito = numberValue(launchForm.deposito)
  const lucroBlogueira = calcularLucro(deposito)
  const banca = deposito - lucroBlogueira
  const lucao = Math.round(lucroBlogueira * 0.5 * 100) / 100
  return { banca, lucroBlogueira, lucao }
})

const totalLucaoHoje = computed(() => {
  return state.launches.reduce((sum, l) => sum + (l.lucao || 0), 0)
})

const movementAttempt = reactive({
  fingerprint: '',
  key: ''
})

function uniqueKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function emptyAccount() {
  return {
    name: '',
    purpose: 'both',
    openingBalance: ''
  }
}

function parsedNumber(value) {
  let text = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\s*pts$/i, '')

  if (!text) return 0
  if (!/^-?[\d.,]+$/.test(text)) return Number.NaN

  const sign = text.startsWith('-') ? '-' : ''
  text = text.replace('-', '')

  if (text.includes(',')) {
    const commaParts = text.split(',')

    if (commaParts.length > 2) return Number.NaN

    const integer = commaParts[0].replace(/\./g, '') || '0'
    const decimal = commaParts[1] || ''
    text = `${integer}.${decimal}`
  } else if (text.includes('.')) {
    const dotParts = text.split('.')
    const thousands =
      dotParts.length > 2
        ? dotParts.slice(1).every(part => part.length === 3)
        : dotParts[1]?.length === 3

    if (thousands) {
      text = dotParts.join('')
    } else if (dotParts.length > 2) {
      return Number.NaN
    }
  }

  const number = Number(sign + text)
  return Number.isFinite(number) ? number : Number.NaN
}

function numberValue(value) {
  const number = parsedNumber(value)
  return Number.isFinite(number) ? number : 0
}

const actionBusy = computed(() => Boolean(pendingAction.value))
const profitFilled = computed(() => {
  const profit = parsedNumber(closing.profitTotal)

  return (
    String(closing.profitTotal ?? '').trim() !== '' &&
    Number.isFinite(profit) &&
    profit >= 0
  )
})

const draftTotal = computed(() =>
  draftAccounts.reduce(
    (sum, account) => sum + numberValue(account.openingBalance),
    0
  )
)

const entryCount = computed(() =>
  state.movements.filter(
    item => item.type === 'entry' && !item.reversed
  ).length
)

const exitCount = computed(() =>
  state.movements.filter(
    item => item.type === 'exit' && !item.reversed
  ).length
)

const closePreview = computed(() => {
  const replacement = Math.max(
    0,
    numberValue(state.totals.opening) -
      numberValue(state.totals.current)
  )

  return Math.max(
    0,
    replacement +
      numberValue(closing.profitTotal) / 2 +
      numberValue(closing.adjustments)
  )
})

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' R$'
}

function purposeName(value) {
  return {
    pay: 'PAGAR',
    receive: 'RECEBEDOR',
    both: 'PAGAR E RECEBER'
  }[value] || value
}

function formatDate(value) {
  if (!value) return '—'

  return new Date(
    String(value).replace(' ', 'T') + 'Z'
  ).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function resetClosing() {
  Object.assign(closing, {
    profitTotal: '',
    adjustments: ''
  })
  showClose.value = false
}

function resetTransientState() {
  draftAccounts.splice(
    0,
    draftAccounts.length,
    emptyAccount()
  )
  Object.assign(newBank, emptyAccount())
  resetClosing()
  showNewBank.value = false
}

function apply(data) {
  const previousDate = state.operationDate
  const previousDayId = state.day?.id || null
  const nextDayId = data.day?.id || null
  const operationChanged =
    Boolean(previousDate) &&
    previousDate !== data.operationDate
  const dayChanged =
    previousDayId !== nextDayId &&
    (previousDayId !== null || nextDayId !== null)

  if (operationChanged || dayChanged) {
    resetTransientState()
  }

  state.operationDate = data.operationDate
  state.day = data.day
  state.accounts = data.accounts || []
  state.movements = data.movements || []
  state.launches = data.launches || []
  state.totalLucao = data.totalLucao || 0
  state.totals = data.totals || state.totals
}

async function load() {
  if (refreshing.value) return

  refreshing.value = true
  loading.value = true

  try {
    const [todayResponse, historyResponse] =
      await Promise.all([
        api.get(
          '/bank-operations/today',
          authHeaders()
        ),
        api.get(
          '/bank-operations/history?limit=30',
          authHeaders()
        )
      ])

    apply(todayResponse.data)
    state.history = historyResponse.data.days || []
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível carregar a Operação do Dia.'
    )
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function addDraft() {
  if (actionBusy.value) return
  draftAccounts.push(emptyAccount())
}

async function openDay() {
  if (actionBusy.value) return
  pendingAction.value = 'open'

  try {
    const { data } = await api.post(
      '/bank-operations/open',
      { accounts: draftAccounts },
      authHeaders()
    )

    apply(data)
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível iniciar o dia.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function addBank() {
  if (actionBusy.value) return
  pendingAction.value = 'bank'

  try {
    const { data } = await api.post(
      `/bank-operations/days/${state.day.id}/accounts`,
      newBank,
      authHeaders()
    )

    apply(data)
    Object.assign(newBank, {
      name: '',
      purpose: 'both',
      openingBalance: ''
    })
    showNewBank.value = false
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível adicionar o banco.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function removeBank(account) {
  if (actionBusy.value) return

  if (!confirm(`Remover "${account.name}" da operação de hoje?`)) return

  pendingAction.value = `remove-${account.id}`

  try {
    const { data } = await api.delete(
      `/bank-operations/days/${state.day.id}/accounts/${account.id}`,
      authHeaders()
    )

    apply(data)
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível remover o banco.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function move(account, type) {
  if (actionBusy.value) return

  const label = type === 'entry' ? 'recebido' : 'pago'
  const amount = prompt(`Valor ${label} em ${account.name}:`)

  if (!amount) return

  const note = prompt(
    'Cliente, banca ou observação (opcional):'
  ) || ''

  const fingerprint = JSON.stringify({
    dayId: state.day.id,
    accountId: account.id,
    type,
    amount,
    note
  })

  if (movementAttempt.fingerprint !== fingerprint) {
    movementAttempt.fingerprint = fingerprint
    movementAttempt.key = uniqueKey()
  }

  pendingAction.value = `movement-${account.id}`

  try {
    const { data } = await api.post(
      `/bank-operations/days/${state.day.id}/movements`,
      {
        accountId: account.id,
        type,
        amount,
        note,
        idempotencyKey: movementAttempt.key
      },
      authHeaders()
    )

    apply(data)
    movementAttempt.fingerprint = ''
    movementAttempt.key = ''
  } catch (error) {
    if (error.response) {
      movementAttempt.fingerprint = ''
      movementAttempt.key = ''
    }

    alert(
      error.response?.data?.error ||
      'Não foi possível registrar a movimentação.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function launch() {
  if (actionBusy.value) return
  if (!launchForm.casa.trim() || !numberValue(launchForm.deposito)) {
    alert('Informe a casa e o valor do depósito.')
    return
  }

  const isEditing = editingId.value !== null
  pendingAction.value = 'launch'

  try {
    const url = isEditing
      ? `/bank-operations/days/${state.day.id}/launches/${editingId.value}`
      : `/bank-operations/days/${state.day.id}/launches`

    const method = isEditing ? api.put : api.post

    const { data } = await method(
      url,
      {
        casa: launchForm.casa,
        deposito: launchForm.deposito,
        saque: launchForm.saque || ''
      },
      authHeaders()
    )

    apply(data)
    Object.assign(launchForm, { casa: '', deposito: '', saque: '' })
    editingId.value = null
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível registrar o lançamento.'
    )
  } finally {
    pendingAction.value = ''
  }
}

function cancelEdit() {
  Object.assign(launchForm, { casa: '', deposito: '', saque: '' })
  editingId.value = null
}

function editLaunch(l) {
  editingId.value = l.id
  launchForm.casa = l.casa
  launchForm.deposito = String(l.deposito)
  launchForm.saque = l.saque ? String(l.saque) : ''
  window.scrollTo({ top: document.querySelector('.launch-panel')?.offsetTop - 20, behavior: 'smooth' })
}

async function deleteLaunch(l) {
  if (actionBusy.value) return

  if (!confirm(`Excluir lançamento de ${l.casa} (R$ ${l.deposito})?`)) return

  pendingAction.value = `delete-launch-${l.id}`

  try {
    const { data } = await api.delete(
      `/bank-operations/days/${state.day.id}/launches/${l.id}`,
      authHeaders()
    )

    apply(data)
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível excluir o lançamento.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function closeDay() {
  if (actionBusy.value) return

  if (!profitFilled.value) {
    alert('Informe o lucro total antes de fechar o dia.')
    return
  }

  if (!confirm('Confirma o fechamento definitivo deste dia?')) {
    return
  }

  pendingAction.value = 'close'

  try {
    const { data } = await api.post(
      `/bank-operations/days/${state.day.id}/close`,
      closing,
      authHeaders()
    )

    apply(data)

    const historyResponse = await api.get(
      '/bank-operations/history?limit=30',
      authHeaders()
    )

    state.history = historyResponse.data.days || []
    resetClosing()
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível fechar o dia.'
    )
  } finally {
    pendingAction.value = ''
  }
}

async function resumeDay(day) {
  if (actionBusy.value) return

  pendingAction.value = `resume-${day.id}`

  try {
    const { data } = await api.get(
      `/bank-operations/days/${day.id}`,
      authHeaders()
    )

    apply(data)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível abrir este dia.'
    )
  } finally {
    pendingAction.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.bank-ops{
  --violet:#5f63d8;
  --purple:#6d4fc4;
  --blue:#318bd5;
  --orange:#f47b20;
  --green:#31b86b;
  --red:#df353d;
  --ink:#2e394d;
  --muted:#71809a;
  color:var(--ink);
  display:grid;
  gap:22px;
}
.hero{
  background:linear-gradient(125deg,var(--violet),var(--purple));
  border-radius:24px;
  padding:28px;
  color:white;
  display:flex;
  justify-content:space-between;
  gap:24px;
  align-items:center;
  box-shadow:0 16px 40px #5554b832;
}
.hero h1{font-size:34px;margin:5px 0 8px;color:white}
.hero p{max-width:720px;margin:0;color:#eef0ff;line-height:1.5}
.hero-actions,.button-row,.bank-actions{display:flex;gap:10px;flex-wrap:wrap}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em}
.notice{
  background:linear-gradient(90deg,#fff8b8,#fffbd9);
  border-left:5px solid #f0a300;
  border-radius:14px;
  padding:16px 18px;
  color:#9a6200;
}
.panel,.summary-card,.bank-card{
  background:#f9faff;
  border:1px solid #e3e8f4;
  border-radius:22px;
  box-shadow:0 10px 28px #37466b12;
}
.panel{padding:24px}
.section-title,.banks-head,.opening-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
}
.section-title h2,.banks-head h2,.close-panel h2{margin:4px 0}
.date-chip,.count-chip,.purpose{
  border-radius:999px;
  padding:7px 11px;
  font-size:12px;
  font-weight:800;
}
.date-chip,.count-chip{background:#e8ecff;color:#5057c8}
.account-editor{display:grid;gap:14px;margin:24px 0}
.draft-card{
  display:grid;
  grid-template-columns:42px 1.3fr 1fr 1fr 40px;
  gap:12px;
  align-items:end;
  background:white;
  border:1px solid #e4e9f4;
  border-radius:17px;
  padding:16px;
}
.draft-number,.bank-icon{
  width:38px;height:38px;border-radius:12px;
  display:grid;place-items:center;
  background:#dff4ff;color:var(--blue);font-weight:900;
}
label{display:grid;gap:7px;font-size:12px;font-weight:800;color:var(--muted)}
input,select,textarea{
  border:1px solid #d9e0ed;
  background:white;
  border-radius:11px;
  padding:12px;
  color:var(--ink);
  outline:none;
}
input:focus,select:focus,textarea:focus{
  border-color:var(--blue);
  box-shadow:0 0 0 3px #318bd520;
}
button{
  border:0;border-radius:11px;padding:12px 17px;
  color:white;font-weight:800;cursor:pointer;
  box-shadow:0 7px 17px #263a6418;
}
button:hover{transform:translateY(-1px)}
button:disabled:hover{transform:none}
.blue{background:var(--blue)}
.orange{background:var(--orange)}
.danger{background:var(--red)}
.soft{background:#e9eef8;color:#4b5870}
.green-button{background:var(--green)}
.icon{padding:9px;font-size:20px}
.opening-total span,.summary-card span,.closing-result span{
  display:block;color:var(--muted);font-size:13px
}
.opening-total strong{font-size:25px}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.summary-card{padding:22px;border-top:5px solid var(--violet)}
.summary-card strong{display:block;font-size:27px;margin:10px 0 5px}
.summary-card small{color:var(--muted)}
.blue-card{border-top-color:var(--blue)}
.green{border-top-color:var(--green)}
.orange-card{border-top-color:var(--orange)}
.closing-result{
  background:linear-gradient(110deg,#252d42,#445170);
  color:white;border-radius:22px;padding:22px;
  display:grid;grid-template-columns:repeat(4,1fr);gap:18px
}
.closing-result span{color:#cbd3e5}
.closing-result strong{font-size:23px}
.send-total{background:#ffffff18;border-radius:14px;padding:14px}
.close-panel{
  display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr auto;
  align-items:end;gap:16px;border:2px solid #ffd5ae
}
.preview{background:#fff3e8;border-radius:14px;padding:12px}
.preview span{display:block;font-size:12px;color:#9a632d}
.preview strong{font-size:22px;color:var(--orange)}
.new-bank{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:12px}
.bank-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.bank-card{padding:20px}
.bank-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.purpose{background:#e9ecf8;color:#5a6680}
.delete-bank{
  background:none;border:none;cursor:pointer;font-size:18px;padding:4px 6px;
  border-radius:8px;opacity:0.6;transition:opacity .15s,background .15s;box-shadow:none;
  margin-left:auto;line-height:1;
}
.delete-bank:hover{opacity:1;background:#fee2e2;transform:none}
.delete-bank:disabled{opacity:0.3}
.purpose.pay{background:#fff0e3;color:#ce650f}
.purpose.receive{background:#e1f8eb;color:#188a4a}
.bank-card h3{margin:16px 0 5px}
.balance{font-size:28px}
.bank-card small{display:block;color:var(--muted);margin-top:4px}
.pix-key{
  margin:14px 0;padding:10px;border-radius:10px;
  background:#eef5ff;color:#3974a7;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:12px
}
.bank-actions button{flex:1}
.launch-panel{display:grid;gap:18px}
.launch-form{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:12px;align-items:end}
.launch-actions{display:flex;gap:8px}
.compact{padding:6px 10px;font-size:12px}
.actions-cell{display:flex;gap:6px}
.highlight-card{
  background:linear-gradient(110deg,#1a6b3c,#28a05a);
  border-radius:22px;padding:22px;color:white;
  box-shadow:0 10px 32px #1a6b3c40
}
.highlight-content{display:flex;flex-direction:column;gap:4px}
.highlight-content span{color:#d4f5e3;font-size:14px;font-weight:700}
.highlight-content strong{font-size:36px}
.highlight-content small{color:#b0e8c8}
.launch-preview{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;background:#eef4ff;border-radius:14px;padding:16px}
.launch-preview div{text-align:center}
.launch-preview span{display:block;font-size:12px;color:var(--muted)}
.launch-preview strong{font-size:22px;color:var(--violet)}
.launches-table-wrap{overflow:auto}
.launches-table-wrap table{width:100%;border-collapse:collapse}
.launches-table-wrap th,.launches-table-wrap td{text-align:left;padding:11px 13px;border-bottom:1px solid #e4e9f2;font-size:13px}
.launches-table-wrap th{font-size:11px;color:var(--muted)}
.launch-total{background:#eef4ff;font-weight:800}
.launch-total td{border-bottom:none}

th,td{text-align:left;padding:13px;border-bottom:1px solid #e4e9f2}
th{font-size:12px;color:var(--muted)}
.movement{padding:6px 9px;border-radius:999px;font-size:12px;font-weight:800}
.movement.entry{background:#ddf8e8;color:#188a4a}
.movement.exit{background:#fff0e3;color:#ce650f}
.compact-button{padding:7px 10px;font-size:12px}
.table-wrap{overflow:auto}
.empty,.empty-row{text-align:center;color:var(--muted);padding:35px}
@media(max-width:1000px){
  .summary-grid{grid-template-columns:repeat(2,1fr)}
  .bank-grid{grid-template-columns:repeat(2,1fr)}
  .draft-card,.close-panel,.new-bank,.launch-form{grid-template-columns:1fr 1fr}
  .launch-actions{grid-column:1/-1}
  .draft-number{display:none}
  .closing-result{grid-template-columns:1fr 1fr}
}
@media(max-width:640px){
  .hero,.section-title,.banks-head,.opening-footer{align-items:stretch;flex-direction:column}
  .summary-grid,.bank-grid,.closing-result,.draft-card,.close-panel,.new-bank{
    grid-template-columns:1fr
  }
}
</style>
