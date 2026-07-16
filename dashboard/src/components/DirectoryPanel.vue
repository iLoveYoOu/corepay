<template>
  <div class="directory">
    <div class="directory-header">
      <div>
        <h1>Administração</h1>
        <p>
          Empresas, usuários, perfis e auditoria.
        </p>
      </div>

      <button @click="loadAll">
        Atualizar
      </button>
    </div>

    <div class="directory-tabs">
      <button @click="section='users'">
        Usuários
      </button>

      <button
        v-if="me.role==='super_admin'"
        @click="section='companies'"
      >
        Empresas
      </button>

      <button @click="section='audit'">
        Auditoria
      </button>
    </div>

    <section v-if="section==='users'">
      <div class="directory-form">
        <h2>Novo usuário</h2>

        <input
          v-model="form.name"
          placeholder="Nome"
        />

        <input
          v-model="form.email"
          placeholder="E-mail"
        />

        <input
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          placeholder="Senha"
        />

        <select v-model="form.role">
          <option
            v-if="me.role==='super_admin'"
            value="admin"
          >
            Administrador
          </option>

          <option value="operator">
            Operador
          </option>
        </select>

        <select
          v-if="me.role==='super_admin'"
          v-model="form.companyId"
        >
          <option value="">
            Selecione a empresa
          </option>

          <option
            v-for="company in companies"
            :key="company.id"
            :value="company.id"
          >
            {{ company.name }}
          </option>
        </select>

        <button @click="createUser">
          Criar usuário
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Empresa</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Status</th>
            <th>Último acesso</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
          >
            <td>{{ user.name }}</td>
            <td>{{ user.company_name }}</td>
            <td>{{ user.email }}</td>
            <td>{{ roleName(user.role) }}</td>
            <td>
              {{ user.active ? 'Ativo' : 'Bloqueado' }}
            </td>
            <td>
              {{ formatDate(user.last_login_at) }}
            </td>
            <td>
              <button
                v-if="user.id !== me.id"
                @click="editUser(user)"
              >
                Editar
              </button>

              <button
                v-if="user.id !== me.id"
                class="orange"
                @click="openPasswordReset(user)"
              >
                Senha
              </button>

              <button
                v-if="user.id !== me.id"
                class="danger"
                @click="toggleUser(user)"
              >
                {{
                  user.active
                    ? 'Bloquear'
                    : 'Ativar'
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section
      v-if="
        section==='companies' &&
        me.role==='super_admin'
      "
    >
      <div class="directory-form">
        <h2>Nova empresa</h2>

        <input
          v-model="companyForm.name"
          placeholder="Nome da empresa"
        />

        <input
          v-model="companyForm.code"
          placeholder="Código: SP, RJ..."
        />

        <button @click="createCompany">
          Criar empresa
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Código</th>
            <th>Usuários</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="company in companies"
            :key="company.id"
          >
            <td>{{ company.name }}</td>
            <td>{{ company.code }}</td>
            <td>{{ company.user_count }}</td>
            <td>
              {{ company.active ? 'Ativa' : 'Inativa' }}
            </td>
            <td>
              <button
                :class="company.active ? 'danger' : ''"
                @click="toggleCompany(company)"
              >
                {{
                  company.active
                    ? 'Desativar'
                    : 'Ativar'
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="section==='audit'">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Empresa</th>
            <th>Responsável</th>
            <th>Ação</th>
            <th>Usuário afetado</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="log in audit"
            :key="log.id"
          >
            <td>{{ formatDate(log.created_at) }}</td>
            <td>{{ log.company_name || '-' }}</td>
            <td>{{ log.actor_name || '-' }}</td>
            <td>{{ log.action }}</td>
            <td>{{ log.target_name || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div
      v-if="resetTarget"
      class="modal-backdrop"
      @click.self="cancelPasswordReset"
    >
      <form class="password-modal" @submit.prevent="resetPassword">
        <h2>Nova senha</h2>
        <p>{{ resetTarget.name }} — {{ resetTarget.email }}</p>

        <label>
          Nova senha
          <input
            v-model="resetValue"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <label>
          Confirmar nova senha
          <input
            v-model="resetConfirmation"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <div class="modal-actions">
          <button type="button" @click="cancelPasswordReset">
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
import { ref, onMounted } from 'vue'
import { api, authHeaders } from '../services/api'

const section = ref('users')
const me = ref({})
const users = ref([])
const companies = ref([])
const audit = ref([])
const resetTarget = ref(null)
const resetValue = ref('')
const resetConfirmation = ref('')

const form = ref({
  name: '',
  email: '',
  password: '',
  role: 'operator',
  companyId: ''
})

const companyForm = ref({
  name: '',
  code: ''
})

function roleName(role) {
  const names = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    operator: 'Operador'
  }

  return names[role] || role
}

function formatDate(value) {
  if (!value) return 'Nunca'

  return new Date(
    String(value).replace(' ', 'T') + 'Z'
  ).toLocaleString('pt-BR')
}

async function loadAll() {
  const meResponse = await api.get(
    '/directory/me',
    authHeaders()
  )

  me.value = meResponse.data.user

  const requests = [
    api.get('/directory/users', authHeaders()),
    api.get('/directory/audit?limit=100', authHeaders())
  ]

  if (
    ['super_admin', 'admin'].includes(me.value.role)
  ) {
    requests.push(
      api.get('/directory/companies', authHeaders())
    )
  }

  const responses = await Promise.all(requests)

  users.value = responses[0].data.users || []
  audit.value = responses[1].data.logs || []

  if (responses[2]) {
    companies.value =
      responses[2].data.companies || []
  }

  if (
    me.value.role !== 'super_admin'
  ) {
    form.value.companyId =
      me.value.company_id
  }
}

async function createUser() {
  try {
    await api.post(
      '/directory/users',
      form.value,
      authHeaders()
    )

    form.value = {
      name: '',
      email: '',
      password: '',
      role: 'operator',
      companyId:
        me.value.role === 'super_admin'
          ? ''
          : me.value.company_id
    }

    await loadAll()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao criar usuário.'
    )
  }
}

async function editUser(user) {
  const name = prompt('Nome:', user.name)
  if (!name) return

  const email = prompt('E-mail:', user.email)
  if (!email) return

  let role = user.role

  if (me.value.role === 'super_admin') {
    role = prompt(
      'Perfil: admin ou operator',
      user.role
    ) || user.role
  }

  try {
    await api.patch(
      `/directory/users/${user.id}`,
      {
        name,
        email,
        role,
        companyId: user.company_id
      },
      authHeaders()
    )

    await loadAll()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao editar usuário.'
    )
  }
}

function openPasswordReset(user) {
  resetTarget.value = user
  resetValue.value = ''
  resetConfirmation.value = ''
}

function cancelPasswordReset() {
  resetTarget.value = null
  resetValue.value = ''
  resetConfirmation.value = ''
}

async function resetPassword() {
  if (!resetTarget.value) return

  if (resetValue.value.length < 8) {
    alert('A senha deve ter pelo menos 8 caracteres.')
    return
  }

  if (resetValue.value !== resetConfirmation.value) {
    alert('As senhas não conferem.')
    return
  }

  try {
    await api.post(
      `/directory/users/${resetTarget.value.id}/reset-password`,
      { password: resetValue.value },
      authHeaders()
    )

    cancelPasswordReset()
    alert('Senha redefinida.')
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao redefinir senha.'
    )
  }
}

async function toggleUser(user) {
  try {
    await api.patch(
      `/directory/users/${user.id}/toggle`,
      {},
      authHeaders()
    )

    await loadAll()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao alterar usuário.'
    )
  }
}

async function createCompany() {
  try {
    await api.post(
      '/directory/companies',
      companyForm.value,
      authHeaders()
    )

    companyForm.value = {
      name: '',
      code: ''
    }

    await loadAll()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao criar empresa.'
    )
  }
}

async function toggleCompany(company) {
  try {
    await api.patch(
      `/directory/companies/${company.id}/toggle`,
      {},
      authHeaders()
    )

    await loadAll()
  } catch (err) {
    alert(
      err.response?.data?.error ||
      'Erro ao alterar empresa.'
    )
  }
}

onMounted(loadAll)
</script>

<style scoped>
.directory-header,
.directory-tabs,
.directory-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.directory-header {
  justify-content: space-between;
}

.directory-form {
  background: white;
  padding: 20px;
  border-radius: 16px;
}

.directory-form h2 {
  width: 100%;
  margin: 0 0 8px;
}

select {
  padding: 13px;
  border-radius: 10px;
  border: 1px solid #d7dbe8;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #22264f99;
  backdrop-filter: blur(4px);
}

.password-modal {
  width: min(430px, 100%);
  display: grid;
  gap: 16px;
  padding: 26px;
  border-radius: 20px;
  background: white;
  box-shadow: 0 24px 60px #252a5b44;
}

.password-modal h2,
.password-modal p {
  margin: 0;
}

.password-modal label {
  display: grid;
  gap: 7px;
  font-weight: 700;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
