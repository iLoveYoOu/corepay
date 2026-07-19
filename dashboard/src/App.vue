<template>
  <div class="page">
    <form v-if="!token && !showRegister" class="login" @submit.prevent="login">
      <img src="/logo.jpeg" class="login-brand" alt="CorePay" />
      <h1>Bem-vindo</h1>
      <p class="login-copy">Entre para acessar sua operação.</p>
      <label>
        Usuário ou E-mail
        <input
          v-model="email"
          type="text"
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
      <p class="login-toggle">
        Ainda não tem conta?
        <a href="#" @click.prevent="showRegister = true">Criar usuário</a>
      </p>
      <p class="error">{{ error }}</p>
    </form>

    <form v-if="!token && showRegister" class="login" @submit.prevent="register">
      <img src="/logo.jpeg" class="login-brand" alt="CorePay" />
      <h1>Criar conta</h1>
      <p class="login-copy">Cadastre-se para começar a operar.</p>
      <label>
        Nome de usuário
        <input
          v-model="registerUsername"
          type="text"
          autocomplete="username"
          placeholder="meu.usuario"
        />
      </label>
      <label>
        Senha
        <input
          v-model="registerPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Sua senha"
        />
      </label>
      <label>
        Confirmar senha
        <input
          v-model="registerConfirm"
          type="password"
          autocomplete="new-password"
          placeholder="Confirme a senha"
        />
      </label>
      <button type="submit" :disabled="authLoading">
        {{ authLoading ? 'Cadastrando...' : 'Criar conta' }}
      </button>
      <p class="login-toggle">
        Já tem conta?
        <a href="#" @click.prevent="showRegister = false">Entrar</a>
      </p>
      <p class="error">{{ error }}</p>
    </form>

    <div v-else class="app">
      <aside>
        <img src="/logo.jpeg" class="sidebar-logo" alt="CorePay" />

        <button
          :class="{ active: tab === 'banking' }"
          @click="tab='banking'"
        >
          Operação Diária
        </button>

        <button
          v-if="['admin','super_admin'].includes(wallet.role)"
          :class="{ active: tab === 'directory' }"
          @click="tab='directory'"
        >
          Administração
        </button>

        <button class="danger" @click="logout">
          Sair
        </button>
      </aside>

      <main>
        <section v-if="tab==='banking'">
          <BankOperations />
        </section>

        <section v-if="tab==='directory'">
          <DirectoryPanel />
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
const showRegister = ref(false)
const registerUsername = ref('')
const registerPassword = ref('')
const registerConfirm = ref('')
const tab = ref('banking')
const showPasswordChange = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')

const wallet = ref({})

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' pts'
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

async function register() {
  if (authLoading.value) return

  error.value = ''
  authLoading.value = true

  try {
    await api.post('/auth/register', {
      username: registerUsername.value,
      password: registerPassword.value,
      confirmPassword: registerConfirm.value
    })

    showRegister.value = false
    email.value = registerUsername.value
    registerUsername.value = ''
    registerPassword.value = ''
    registerConfirm.value = ''
    error.value = 'Conta criada! Agora faça o login.'
  } catch (err) {
    error.value =
      err.response?.data?.error ||
      'Não foi possível cadastrar.'
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
  tab.value = 'banking'
  password.value = ''
  showRegister.value = false
  registerUsername.value = ''
  registerPassword.value = ''
  registerConfirm.value = ''
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
