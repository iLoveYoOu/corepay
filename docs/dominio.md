# Configuração de Domínio — CorePay

## Objetivo

Fazer https://www.meiadolucao.com.br servir o mesmo sistema hospedado em
https://corepay-8b76.onrender.com, **sem redirecionamento externo** —
servindo o aplicativo diretamente no domínio oficial.

---

## 1. Configurações no Código (já aplicadas)

| Variável | Valor | Onde |
|---|---|---|
| `PUBLIC_URL` | `https://www.meiadolucao.com.br` | `.env` (usado nos webhooks do Mercado Pago) |
| `CORS_ORIGINS` | `https://www.meiadolucao.com.br` (pode incluir `https://corepay-8b76.onrender.com` para testes) | `.env` |
| `NODE_ENV` | `production` | `.env` |

Nenhuma alteração de cookie, redirect ou sessão é necessária — o CorePay usa
autenticação stateless via JWT no header `Authorization`, sem cookies de
sessão.

---

## 2. No Render — Custom Domain

1. Acesse o dashboard do Render → seu serviço Web (CorePay).
2. Vá em **Settings → Custom Domain**.
3. Adicione o domínio: **`www.meiadolucao.com.br`**
4. O Render fornecerá um valor de destino (target) — será algo como
   `corepay-8b76.onrender.com`.
5. Mantenha a opção **"Automatically configure DNS"** desligada, pois
   faremos o CNAME manualmente no provedor DNS.

---

## 3. No Provedor DNS (registro.br, Cloudflare, etc.)

Crie o seguinte registro:

| Tipo | Nome | Valor |
|---|---|---|
| **CNAME** | `www` | `corepay-8b76.onrender.com` |

### Domínio raiz (`meiadolucao.com.br`)

O Render **não** fornece IP fixo para um registro A do domínio raiz.
Recomenda-se:

- **Opção A (mais simples, Render compatível):** configure um redirecionamento
  (forward) de `meiadolucao.com.br` para `https://www.meiadolucao.com.br` no
  próprio provedor DNS (registro.br, Cloudflare, etc.).
- **Opção B (se o provedor suportar):** alguns provedores (Cloudflare) permitem
  registro CNAME para o domínio raiz (CNAME flattening). Nesse caso, aponte
  `meiadolucao.com.br` como CNAME para `corepay-8b76.onrender.com`.

---

## 4. Verificação

Após propagação do DNS (pode levar de minutos a horas):

```bash
curl -I https://www.meiadolucao.com.br/health
# Esperado: HTTP 200, body JSON com status "online"

curl -I https://www.meiadolucao.com.br/
# Esperado: HTTP 200, HTML do dashboard Vue
```

---

## 5. Rollback / Reversão

- Remova o Custom Domain no Render.
- Remova ou altere o registro CNAME no DNS.
- Restaure `PUBLIC_URL` no `.env` para o valor anterior.
- Restaure `CORS_ORIGINS` no `.env` para o valor anterior.
