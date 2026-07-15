<template>
  <div class="bank-ops">
    <header class="hero">
      <div>
        <span class="eyebrow">CONTROLE OPERACIONAL</span>
        <h1>Operação Bancária</h1>
        <p>
          Organize os bancos do turno, registre entradas e saídas
          e descubra o repasse do fechamento sem custodiar dinheiro.
        </p>
      </div>

      <div class="hero-actions">
        <button class="blue" @click="load">Atualizar</button>
        <button
          v-if="state.day?.status === 'open'"
          class="orange"
          @click="showClose = !showClose"
        >
          Fechar dia
        </button>
      </div>
    </header>

    <div class="notice">
      <strong>Controle manual:</strong>
      confirme cada movimentação somente depois de conferir no aplicativo do banco.
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
              <option value="both">Pagar e receber</option>
              <option value="pay">Somente pagar</option>
              <option value="receive">Somente receber</option>
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

          <label>
            Chave Pix (opcional)
            <input
              v-model="account.pixKey"
              placeholder="CPF, CNPJ, e-mail ou aleatória"
            />
          </label>

          <button
            v-if="draftAccounts.length > 1"
            class="icon danger"
            title="Remover banco"
            @click="draftAccounts.splice(index, 1)"
          >
            ×
          </button>
        </div>
      </div>

      <div class="opening-footer">
        <div class="opening-total">
          <span>Capital inicial informado</span>
          <strong>{{ money(draftTotal) }}</strong>
        </div>

        <div class="button-row">
          <button class="soft" @click="addDraft">+ Adicionar banco</button>
          <button class="blue" @click="openDay">Iniciar operação</button>
        </div>
      </div>
    </section>

    <template v-else>
      <section class="summary-grid">
        <article class="summary-card violet">
          <span>Capital inicial</span>
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

        <button class="orange" @click="closeDay">
          Confirmar fechamento
        </button>
      </section>

      <section class="banks-head">
        <div>
          <span class="eyebrow">BANCOS DO TURNO</span>
          <h2>Saldos operacionais</h2>
        </div>

        <button
          v-if="state.day.status === 'open'"
          class="soft"
          @click="showNewBank = !showNewBank"
        >
          + Adicionar banco
        </button>
      </section>

      <section
        v-if="showNewBank && state.day.status === 'open'"
        class="panel new-bank"
      >
        <input v-model="newBank.name" placeholder="Nome do banco" />
        <select v-model="newBank.purpose">
          <option value="both">Pagar e receber</option>
          <option value="pay">Somente pagar</option>
          <option value="receive">Somente receber</option>
        </select>
        <input
          v-model="newBank.openingBalance"
          inputmode="decimal"
          placeholder="Saldo inicial"
        />
        <input v-model="newBank.pixKey" placeholder="Chave Pix opcional" />
        <button class="blue" @click="addBank">Salvar banco</button>
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
          </div>

          <h3>{{ account.name }}</h3>
          <strong class="balance">
            {{ money(account.currentBalance) }}
          </strong>
          <small>
            Inicial: {{ money(account.openingBalance) }}
          </small>

          <div
            v-if="account.pix_key"
            class="pix-key"
            :title="account.pix_key"
          >
            Pix: {{ account.pix_key }}
          </div>

          <div
            v-if="state.day.status === 'open'"
            class="bank-actions"
          >
            <button class="green-button" @click="move(account, 'entry')">
              + Recebi
            </button>
            <button class="orange" @click="move(account, 'exit')">
              − Paguei
            </button>
          </div>

          <button
            v-if="account.pix_key"
            class="pix-button"
            @click="generatePix(account)"
          >
            Gerar Pix sem valor
          </button>
        </article>
      </section>

      <section v-if="pix.show" class="panel pix-panel">
        <div>
          <span class="eyebrow">PIX ESTÁTICO SEM VALOR</span>
          <h2>{{ pix.bankName }}</h2>
          <p>
            O pagador informa o valor no aplicativo bancário.
            O CorePay não cobra nem confirma automaticamente.
          </p>
        </div>

        <label>
          Nome do recebedor
          <input v-model="pix.merchantName" placeholder="Nome ou empresa" />
        </label>

        <label>
          Cidade
          <input v-model="pix.merchantCity" placeholder="Ex.: SAO PAULO" />
        </label>

        <button class="blue" @click="createPixPayload">
          Gerar copia e cola
        </button>

        <textarea
          v-if="pix.payload"
          readonly
          :value="pix.payload"
        />

        <button
          v-if="pix.payload"
          class="green-button"
          @click="copyPix"
        >
          Copiar código Pix
        </button>
      </section>

      <section class="panel movements">
        <div class="section-title">
          <div>
            <span class="eyebrow">CONCILIAÇÃO</span>
            <h2>Movimentações do dia</h2>
          </div>
          <span class="count-chip">
            {{ state.movements.length }} registros
          </span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Banco</th>
                <th>Movimento</th>
                <th>Valor</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="movement in state.movements"
                :key="movement.id"
              >
                <td>{{ formatDate(movement.created_at) }}</td>
                <td>{{ movement.account_name }}</td>
                <td>
                  <span :class="['movement', movement.type]">
                    {{ movement.type === 'entry' ? 'Entrada' : 'Saída' }}
                  </span>
                </td>
                <td>{{ money(movement.amount) }}</td>
                <td>{{ movement.note || '—' }}</td>
              </tr>
              <tr v-if="!state.movements.length">
                <td colspan="5" class="empty-row">
                  Nenhuma movimentação registrada.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api, authHeaders } from '../services/api'

const loading = ref(true)
const showClose = ref(false)
const showNewBank = ref(false)

const state = reactive({
  operationDate: '',
  day: null,
  accounts: [],
  movements: [],
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
    openingBalance: '',
    pixKey: ''
  }
])

const newBank = reactive({
  name: '',
  purpose: 'both',
  openingBalance: '',
  pixKey: ''
})

const closing = reactive({
  profitTotal: '',
  adjustments: ''
})

const pix = reactive({
  show: false,
  bankName: '',
  pixKey: '',
  merchantName: '',
  merchantCity: '',
  payload: ''
})

function numberValue(value) {
  let text = String(value || '').trim()

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else {
    text = text.replace(',', '.')
  }

  return Number(text) || 0
}

const draftTotal = computed(() =>
  draftAccounts.reduce(
    (sum, account) => sum + numberValue(account.openingBalance),
    0
  )
)

const entryCount = computed(() =>
  state.movements.filter(item => item.type === 'entry').length
)

const exitCount = computed(() =>
  state.movements.filter(item => item.type === 'exit').length
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
    style: 'currency',
    currency: 'BRL'
  })
}

function purposeName(value) {
  return {
    pay: 'PAGADOR',
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

function apply(data) {
  state.operationDate = data.operationDate
  state.day = data.day
  state.accounts = data.accounts || []
  state.movements = data.movements || []
  state.totals = data.totals || state.totals
}

async function load() {
  loading.value = true

  try {
    const { data } = await api.get(
      '/bank-operations/today',
      authHeaders()
    )

    apply(data)
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível carregar a operação bancária.'
    )
  } finally {
    loading.value = false
  }
}

function addDraft() {
  draftAccounts.push({
    name: '',
    purpose: 'both',
    openingBalance: '',
    pixKey: ''
  })
}

async function openDay() {
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
  }
}

async function addBank() {
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
      openingBalance: '',
      pixKey: ''
    })
    showNewBank.value = false
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível adicionar o banco.'
    )
  }
}

async function move(account, type) {
  const label = type === 'entry' ? 'recebido' : 'pago'
  const amount = prompt(`Valor ${label} em ${account.name}:`)

  if (!amount) return

  const note = prompt(
    'Cliente, banca ou observação (opcional):'
  ) || ''

  try {
    const { data } = await api.post(
      `/bank-operations/days/${state.day.id}/movements`,
      {
        accountId: account.id,
        type,
        amount,
        note
      },
      authHeaders()
    )

    apply(data)
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível registrar a movimentação.'
    )
  }
}

async function closeDay() {
  if (!confirm('Confirma o fechamento definitivo deste dia?')) {
    return
  }

  try {
    const { data } = await api.post(
      `/bank-operations/days/${state.day.id}/close`,
      closing,
      authHeaders()
    )

    apply(data)
    showClose.value = false
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível fechar o dia.'
    )
  }
}

function generatePix(account) {
  Object.assign(pix, {
    show: true,
    bankName: account.name,
    pixKey: account.pix_key,
    payload: ''
  })
}

async function createPixPayload() {
  try {
    const { data } = await api.post(
      '/bank-operations/pix-static',
      {
        pixKey: pix.pixKey,
        merchantName: pix.merchantName,
        merchantCity: pix.merchantCity
      },
      authHeaders()
    )

    pix.payload = data.payload
  } catch (error) {
    alert(
      error.response?.data?.error ||
      'Não foi possível gerar o Pix.'
    )
  }
}

async function copyPix() {
  await navigator.clipboard.writeText(pix.payload)
  alert('Pix copia e cola copiado.')
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
.hero h1{font-size:34px;margin:5px 0 8px}
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
  grid-template-columns:42px 1.3fr 1fr 1fr 1.5fr 40px;
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
.new-bank{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.5fr auto;gap:12px}
.bank-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.bank-card{padding:20px}
.bank-top{display:flex;justify-content:space-between;align-items:center}
.purpose{background:#e9ecf8;color:#5a6680}
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
.pix-button{width:100%;margin-top:10px;background:#5b61d0}
.pix-panel{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:14px;align-items:end}
.pix-panel textarea{grid-column:1/-2;min-height:100px}
.movements table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{text-align:left;padding:13px;border-bottom:1px solid #e4e9f2}
th{font-size:12px;color:var(--muted)}
.movement{padding:6px 9px;border-radius:999px;font-size:12px;font-weight:800}
.movement.entry{background:#ddf8e8;color:#188a4a}
.movement.exit{background:#fff0e3;color:#ce650f}
.table-wrap{overflow:auto}
.empty,.empty-row{text-align:center;color:var(--muted);padding:35px}
@media(max-width:1000px){
  .summary-grid{grid-template-columns:repeat(2,1fr)}
  .bank-grid{grid-template-columns:repeat(2,1fr)}
  .draft-card,.close-panel,.new-bank,.pix-panel{grid-template-columns:1fr 1fr}
  .draft-number,.icon{display:none}
  .closing-result{grid-template-columns:1fr 1fr}
}
@media(max-width:640px){
  .hero,.section-title,.banks-head,.opening-footer{align-items:stretch;flex-direction:column}
  .summary-grid,.bank-grid,.closing-result,.draft-card,.close-panel,.new-bank,.pix-panel{
    grid-template-columns:1fr
  }
  .pix-panel textarea{grid-column:auto}
}
</style>
