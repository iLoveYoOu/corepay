<template>
  <div v-if="show" class="overlay">
    <div class="modal">
      <h2>Pix gerado</h2>
      <p><b>Valor:</b> {{ money(value) }}</p>

      <img v-if="encodedImage" class="qr" :src="'data:image/png;base64,' + encodedImage" />

      <textarea readonly :value="payload"></textarea>

      <div class="actions">
        <button @click="copyPix">Copiar Pix</button>
        <button @click="$emit('refresh')">Atualizar saldo</button>
        <button class="danger" @click="$emit('close')">Fechar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  value: Number,
  encodedImage: String,
  payload: String
})

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function copyPix() {
  await navigator.clipboard.writeText(props.payload || '')
  alert('Pix copiado.')
}
</script>

<style scoped>
.overlay{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:99}
.modal{background:#fff;border-radius:18px;padding:24px;width:430px;max-width:92vw}
.qr{width:260px;height:260px;display:block;margin:15px auto}
textarea{width:100%;height:130px;border:1px solid #ddd;border-radius:10px;padding:10px}
.actions{display:flex;gap:10px;margin-top:15px;flex-wrap:wrap}
button{padding:12px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:bold}
.danger{background:#d93030}
</style>
