# Provisiona MVP Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o MVP do Provisiona: auth Google/magic-link com sync Supabase, CRUD completo com validações, recorrência automática, relatório de gastos e PWA publicada na Vercel.

**Architecture:** Evoluir a estrutura atual sem refatoração — lógica em `src/composables/` (useBills, novo useAuth), UI em `src/app.vue` (vistas por `activeView`), data-math puro em `src/utils/dates.js` (testável via node). Deploy Vercel CLI; sem mudanças de schema no banco.

**Tech Stack:** Nuxt 4 SPA (`ssr:false`), Vue 3, Quasar 2, @supabase/supabase-js 2, @vite-pwa/nuxt, Vercel CLI.

## Global Constraints

- Sem framework de testes no projeto; verificação = `npm run lint`, `node -e` para lógica pura, e fluxo manual no navegador (dev na porta 9100).
- Valores de `source_channel`, `payment_method`, `bank_account`, `status` devem casar com os CHECKs de `supabase/migrations/202607190001_create_bills.sql`.
- Título 2–120 chars, `amount >= 0` (CHECKs do banco).
- App precisa continuar 100% funcional em modo local/demo sem Supabase configurado.
- Nunca usar chave `service_role` no frontend.
- Textos de UI em pt-BR, estilo visual atual (vars `--acid`, `--peach`, `--ink`, fonte DM Mono para eyebrows).
- Commits frequentes com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Date math + lógica de domínio (remove, markPaid com recorrência, pushLocal)

**Files:**
- Create: `src/utils/dates.js`
- Modify: `src/composables/useBills.js`

**Interfaces:**
- Produces: `addMonthsClamped(iso: 'YYYY-MM-DD', months: number): string`; `useBills()` passa a expor `remove(id)`, `markPaid(id): Promise<{next: bill|null}>`, `pushLocal(): Promise<void>`, `hasRealLocalBills: computed<boolean>`.

- [ ] **Step 1: Criar `src/utils/dates.js`**

```js
export function addMonthsClamped(iso, months) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Verificar date math com node**

Run: `node -e "import('./src/utils/dates.js').then(({addMonthsClamped:f})=>{const cases=[['2026-01-31',1,'2026-02-28'],['2028-01-31',1,'2028-02-29'],['2026-12-05',1,'2027-01-05'],['2026-08-31',1,'2026-09-30'],['2026-03-30',1,'2026-04-30']];for(const[a,m,e]of cases){const r=f(a,m);console.log(r===e?'PASS':'FAIL',a,'->',r,'esperado',e)}})"`
Expected: 5× PASS (clamp fev, bissexto, virada de ano, mês de 30 dias).

- [ ] **Step 3: Adicionar `remove`, `markPaid`, `pushLocal`, `hasRealLocalBills` em useBills.js**

```js
import { addMonthsClamped } from '../utils/dates'

const isDemoId = (id) => String(id).startsWith('demo-')

// dentro de useBills():
const hasRealLocalBills = computed(() => bills.value.some((bill) => !isDemoId(bill.id)))

async function remove(id) {
  bills.value = bills.value.filter((item) => item.id !== id)
  persist()
  if (syncMode.value === 'supabase' && !isDemoId(id)) {
    const { error } = await supabase.from('bills').delete().eq('id', id)
    if (error) throw error
  }
}

function nextOccurrence(bill) {
  return {
    ...bill,
    id: crypto.randomUUID(),
    dueDate: addMonthsClamped(bill.dueDate, 1),
    documentExpectedAt: bill.documentExpectedAt ? addMonthsClamped(bill.documentExpectedAt, 1) : '',
    discountUntil: bill.discountUntil ? addMonthsClamped(bill.discountUntil, 1) : '',
    amount: Number(bill.nominalAmount || bill.amount),
    status: 'waiting_document',
    barcode: '',
  }
}

async function markPaid(id) {
  const bill = bills.value.find((item) => item.id === id)
  if (!bill || bill.status === 'paid') return { next: null }
  await save({ ...bill, status: 'paid' })
  let next = null
  if (bill.recurring) { next = nextOccurrence(bill); await save(next) }
  return { next }
}

async function pushLocal() {
  const { data: { user } } = await supabase.auth.getUser()
  const rows = bills.value.filter((bill) => !isDemoId(bill.id)).map((bill) => toRow(bill, user.id))
  if (rows.length) {
    const { error } = await supabase.from('bills').upsert(rows)
    if (error) throw error
  }
  syncMode.value = 'supabase'
  await load()
}
```

`updateStatus` deixa de ser necessário na UI mas permanece (usado por markPaid não — remover se sem uso após Task 3; verificar com grep).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit** — `feat: date math, remove, markPaid com recorrência e pushLocal`

---

### Task 2: useAuth + diálogo de conta (Google + magic link + logout) + fluxo de sessão

**Files:**
- Create: `src/composables/useAuth.js`
- Modify: `src/app.vue` (diálogo auth, pill de sync, onMounted)

**Interfaces:**
- Consumes: `pushLocal()`, `hasRealLocalBills`, `load()` da Task 1.
- Produces: `useAuth()` → `{ user: ref, init(onSession), signInWithGoogle(), signInWithEmail(email), signOut() }`. `init` chama `onSession(user)` no máximo 1× por sessão de página quando há usuário autenticado.

- [ ] **Step 1: Criar `src/composables/useAuth.js`**

```js
import { ref } from 'vue'

const user = ref(null)
let started = false
let sessionHandled = false

export function useAuth() {
  const { $supabase: supabase, $isSupabaseConfigured: isSupabaseConfigured } = useNuxtApp()

  function init(onSession) {
    if (started || !isSupabaseConfigured) return
    started = true
    supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user || null
      if (session?.user && !sessionHandled) {
        sessionHandled = true
        onSession(session.user)
      }
      if (event === 'SIGNED_OUT') sessionHandled = false
    })
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signInWithEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, init, signInWithGoogle, signInWithEmail, signOut }
}
```

- [ ] **Step 2: Reescrever o diálogo `authOpen` em app.vue**

Substituir o card atual (linhas ~125–131) por versão com dois estados:

```html
<q-dialog v-model="authOpen">
  <q-card class="auth-card">
    <template v-if="!user">
      <q-card-section><span class="mono">SINCRONIZAÇÃO SEGURA</span><h2>Entrar no Provisiona</h2><p>Seus compromissos ficam protegidos por usuário (RLS). Nenhuma senha bancária é armazenada.</p></q-card-section>
      <q-card-section class="q-gutter-y-sm">
        <q-btn class="google-btn full-width" unelevated icon="login" label="Entrar com Google" :loading="authBusy" @click="loginGoogle" />
        <div class="auth-divider mono">OU RECEBA UM LINK</div>
        <q-input v-model="authEmail" outlined type="email" label="Seu e-mail" @keyup.enter="sendMagicLink" />
      </q-card-section>
      <q-card-actions align="right"><q-btn flat label="Cancelar" v-close-popup /><q-btn unelevated color="dark" label="Enviar link" @click="sendMagicLink" /></q-card-actions>
    </template>
    <template v-else>
      <q-card-section><span class="mono">CONTA CONECTADA</span><h2>{{ user.user_metadata?.full_name || 'Sua conta' }}</h2><p>{{ user.email }} · sincronizando com Supabase.</p></q-card-section>
      <q-card-actions align="right"><q-btn flat label="Fechar" v-close-popup /><q-btn outline color="negative" label="Sair" @click="logout" /></q-card-actions>
    </template>
  </q-card>
</q-dialog>
```

- [ ] **Step 3: Script setup — integrar useAuth e fluxo de sessão**

```js
import { useAuth } from './composables/useAuth'
const { user, init: initAuth, signInWithGoogle, signInWithEmail, signOut } = useAuth()
const authBusy = ref(false)

async function loginGoogle() {
  authBusy.value = true
  try { await signInWithGoogle() } catch (error) { $q.notify({ type: 'negative', message: error.message }); authBusy.value = false }
}

async function sendMagicLink() {
  if (!authEmail.value) return
  try { await signInWithEmail(authEmail.value); authOpen.value = false; $q.notify({ color: 'dark', icon: 'mark_email_read', message: 'Link de acesso enviado.' }) }
  catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}

async function logout() {
  await signOut()
  authOpen.value = false
  $q.notify({ color: 'dark', icon: 'logout', message: 'Sessão encerrada. Modo local ativo.' })
}

async function handleSession() {
  const { count, error } = await supabase.from('bills').select('id', { count: 'exact', head: true })
  if (error) return $q.notify({ type: 'warning', message: `Supabase: ${error.message}` })
  if (count === 0 && hasRealLocalBills.value) {
    $q.dialog({ title: 'Importar dados locais?', message: 'Sua conta está vazia. Enviar os compromissos criados neste aparelho para o Supabase?', ok: { label: 'Importar', color: 'dark', unelevated: true }, cancel: { label: 'Começar do zero', flat: true } })
      .onOk(() => pushLocal().catch((e) => $q.notify({ type: 'negative', message: e.message })))
      .onCancel(() => load().catch((e) => $q.notify({ type: 'negative', message: e.message })))
  } else {
    await load().catch((e) => $q.notify({ type: 'negative', message: e.message }))
  }
  authOpen.value = false
}

onMounted(() => initAuth(handleSession))
```

Remover o `onMounted(() => load()...)` antigo (o load agora acontece via handleSession) e o `sendMagicLink` antigo. `syncMode` volta para `'local'` no logout: adicionar em `logout()` → usar `resetToLocal()`? Não — manter simples: em `logout()`, após signOut, `syncMode` é interno de useBills; expor `goLocal()` em useBills: `function goLocal() { syncMode.value = 'local' }` e chamar em logout.

CSS a acrescentar no bloco scoped: `.google-btn { background: var(--ink); color: white; } .auth-divider { text-align: center; font-size: 9px; color: var(--muted); margin: 10px 0 2px; }`

Pill de sync: quando `user`, mostrar e-mail curto — `{{ syncMode === 'supabase' ? 'Sincronizado · ' + (user?.email || '') : 'Modo demonstração' }}`.

- [ ] **Step 4: Lint + dev manual**

Run: `npm run lint`; subir `npm run dev` e verificar no navegador: diálogo abre, botão Google presente (o redirect real só funciona com provider configurado no painel).

- [ ] **Step 5: Commit** — `feat: login Google/magic link com sessão, import de dados locais e logout`

---

### Task 3: CRUD completo — excluir, marcar paga em um toque, validações

**Files:**
- Modify: `src/app.vue` (editor actions, bill-row, compact-card, rules)

**Interfaces:**
- Consumes: `remove(id)`, `markPaid(id)` da Task 1.

- [ ] **Step 1: Validações no editor**

Nos q-input do editor (seção 01 · COBRANÇA): adicionar `:rules` + `lazy-rules`:
- título: `:rules="[v => (!!v && v.trim().length >= 2 && v.trim().length <= 120) || 'Entre 2 e 120 caracteres']"`
- valor: `:rules="[v => (v !== null && v !== '' && Number(v) >= 0) || 'Informe um valor válido']"`
- vencimento: `:rules="[v => !!v || 'Informe o vencimento']"`

`saveDraft` reforça (fonte da verdade):

```js
async function saveDraft() {
  const title = (draft.title || '').trim()
  if (title.length < 2 || title.length > 120) return $q.notify({ type: 'warning', message: 'Nome deve ter entre 2 e 120 caracteres.' })
  if (draft.amount === null || draft.amount === '' || Number(draft.amount) < 0) return $q.notify({ type: 'warning', message: 'Informe um valor válido.' })
  if (!draft.dueDate) return $q.notify({ type: 'warning', message: 'Informe o vencimento.' })
  try { await save(structuredClone({ ...draft, title })); editorOpen.value = false; $q.notify({ color: 'dark', textColor: 'white', icon: 'done', message: 'Compromisso salvo.' }) }
  catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}
```

- [ ] **Step 2: Excluir com confirmação**

Em `.editor-actions`, antes do Cancelar: `<q-btn v-if="draft.id" flat color="negative" icon="delete_outline" label="Excluir" @click="confirmRemove" />`

```js
function confirmRemove() {
  $q.dialog({ title: 'Excluir compromisso?', message: `"${draft.title}" será removido${syncMode === 'supabase' ? ' também do Supabase' : ''}.`, ok: { label: 'Excluir', color: 'negative', unelevated: true }, cancel: { label: 'Manter', flat: true } })
    .onOk(async () => {
      try { await remove(draft.id); editorOpen.value = false; $q.notify({ color: 'dark', icon: 'delete', message: 'Compromisso excluído.' }) }
      catch (error) { $q.notify({ type: 'negative', message: error.message }) }
    })
}
```

- [ ] **Step 3: Marcar paga em um toque**

```js
async function payBill(bill) {
  try {
    const { next } = await markPaid(bill.id)
    $q.notify({ color: 'dark', textColor: 'white', icon: 'task_alt', message: next ? `Paga! Próxima gerada para ${formatDate(next.dueDate)}.` : 'Marcada como paga.' })
  } catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}
```

- bill-row (dashboard): substituir `<q-icon name="chevron_right" class="row-arrow" />` por `<q-btn v-if="bill.status !== 'paid'" class="row-pay" round flat icon="task_alt" aria-label="Marcar como paga" @click.stop="payBill(bill)" /><q-icon v-else name="chevron_right" class="row-arrow" />`
- compact-card (contas): no `__top`, ao lado da data: `<q-btn v-if="bill.status !== 'paid'" dense round flat size="sm" icon="task_alt" aria-label="Marcar como paga" @click.stop="payBill(bill)" />`

CSS scoped: `.row-pay { color: var(--muted); } .row-pay:hover { color: var(--ink); }`

- [ ] **Step 4: Lint + verificação manual (dev): criar, validar erros, pagar recorrente (gera próxima), excluir**

- [ ] **Step 5: Commit** — `feat: excluir, marcar paga em um toque e validações no formulário`

---

### Task 4: Relatório de despesas

**Files:**
- Modify: `src/app.vue` (nav 5 itens + vista report + agregações + CSS)

**Pré-passo obrigatório:** carregar a skill `dataviz` antes de construir os gráficos.

- [ ] **Step 1: Nav + agregações**

nav ganha `{ id: 'report', label: 'Relatório', icon: 'insights' }` (entre bills e sources). CSS: `.mobile-first-app .rail nav` → `repeat(5, minmax(0, 1fr))`; scoped `@media (max-width: 720px) .rail nav` → `repeat(5,1fr)`.

```js
const reportMonth = ref(new Date().toISOString().slice(0, 7))
const monthOptions = computed(() => { const out = []; const now = new Date(); for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1)); const value = d.toISOString().slice(0, 7); out.push({ value, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) }) } return out })
const monthBills = computed(() => sortedBills.value.filter((bill) => bill.dueDate.startsWith(reportMonth.value)))
const monthTotal = computed(() => monthBills.value.reduce((sum, bill) => sum + Number(bill.amount || 0), 0))
const monthPaid = computed(() => monthBills.value.filter((b) => b.status === 'paid').reduce((s, b) => s + Number(b.amount || 0), 0))
const byCategory = computed(() => { const map = {}; for (const bill of monthBills.value) map[bill.category] = (map[bill.category] || 0) + Number(bill.amount || 0); const max = Math.max(...Object.values(map), 1); return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total, pct: Math.round((total / max) * 100) })) })
const byAccount = computed(() => ['Nubank', 'CAIXA'].map((name) => ({ name, total: monthBills.value.filter((b) => b.bankAccount === name).reduce((s, b) => s + Number(b.amount || 0), 0) })))
const monthlySeries = computed(() => { const out = monthOptions.value.map(({ value, label }) => ({ value, label: label.split(' ')[0].slice(0, 3).toUpperCase(), total: sortedBills.value.filter((b) => b.dueDate.startsWith(value)).reduce((s, b) => s + Number(b.amount || 0), 0) })).reverse(); const max = Math.max(...out.map((m) => m.total), 1); return out.map((m) => ({ ...m, pct: Math.round((m.total / max) * 100) })) })
```

- [ ] **Step 2: Template da vista** (estilo do app: barras CSS como `.fund-progress`, tiles mono; detalhes finais seguindo a skill dataviz)

```html
<template v-else-if="activeView === 'report'">
  <header class="sub-heading"><div><span class="eyebrow mono">RELATÓRIO</span><h1>Análise de gastos</h1></div><q-select v-model="reportMonth" outlined dense :options="monthOptions" emit-value map-options /></header>
  <section class="report-tiles">
    <article><span class="mono">TOTAL DO MÊS</span><strong>{{ money(monthTotal) }}</strong><small>{{ monthBills.length }} compromissos</small></article>
    <article><span class="mono">PAGO</span><strong>{{ money(monthPaid) }}</strong><small>{{ Math.round(monthTotal ? (monthPaid / monthTotal) * 100 : 0) }}% executado</small></article>
    <article><span class="mono">EM ABERTO</span><strong>{{ money(monthTotal - monthPaid) }}</strong><small>a provisionar</small></article>
  </section>
  <section class="section-block"><div class="section-title"><div><span class="mono">ÚLTIMOS 6 MESES</span><h2>Evolução</h2></div></div>
    <div class="trend-chart"><div v-for="m in monthlySeries" :key="m.value" class="trend-col" :class="{ active: m.value === reportMonth }" @click="reportMonth = m.value"><span class="trend-value mono">{{ money(m.total) }}</span><div class="trend-bar"><span :style="{ height: m.pct + '%' }"></span></div><span class="mono">{{ m.label }}</span></div></div>
  </section>
  <section class="section-block"><div class="section-title"><div><span class="mono">POR CATEGORIA</span><h2>Onde o dinheiro vai</h2></div></div>
    <div class="cat-list"><div v-for="cat in byCategory" :key="cat.name" class="cat-row"><span>{{ cat.name }}</span><div class="cat-bar"><span :style="{ width: cat.pct + '%' }"></span></div><b>{{ money(cat.total) }}</b></div><p v-if="!byCategory.length" class="empty-note">Sem despesas neste mês.</p></div>
  </section>
  <section class="section-block"><div class="section-title"><div><span class="mono">POR CONTA PAGADORA</span><h2>Saída por banco</h2></div></div>
    <div class="account-grid"><article v-for="acc in byAccount" :key="acc.name"><span class="mono">{{ acc.name.toUpperCase() }}</span><strong>{{ money(acc.total) }}</strong></article></div>
  </section>
</template>
```

CSS (scoped): tiles em grid 3 col (1 col mobile), `.trend-chart` flex com colunas de altura fixa 140px, barras `background: var(--acid)` (mês ativo) / `var(--line)`; `.cat-bar` como fund-progress; `.account-grid` 2 col. Dark mode herda vars.

- [ ] **Step 3: Lint + verificação manual das agregações com dados demo (UVV dez/2026 etc.: trocar mês no seletor e conferir números)**

- [ ] **Step 4: Commit** — `feat: relatório de análise de gastos`

---

### Task 5: Ícones PWA

**Files:**
- Create: `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png` (via script PowerShell System.Drawing — fundo `#17251f`, 3 barras da marca em `#d8ff55`/`#f1bd8a` rotacionadas −8°, safe zone maskable de 20%)
- Modify: `nuxt.config.ts` (head: `link` `apple-touch-icon` → `/icons/icon-192x192.png`)

- [ ] **Step 1: Gerar PNGs com script PowerShell (System.Drawing), 512 e 192**
- [ ] **Step 2: Conferir arquivos existem e abrem (Read da imagem)**
- [ ] **Step 3: `npm run build` — manifest referencia ícones agora existentes**
- [ ] **Step 4: Commit** — `feat: ícones PWA e apple-touch-icon`

---

### Task 6: Deploy Vercel + configuração final

**Files:**
- Modify: `README.md` (seção de deploy)

- [ ] **Step 1: Verificar login CLI: `npx vercel whoami` (se não logado, pedir ao usuário `npx vercel login`)**
- [ ] **Step 2: `npx vercel link` (criar projeto) + `npx vercel env add NUXT_PUBLIC_SUPABASE_URL production` e `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production` com os valores do `.env` local**
- [ ] **Step 3: `npx vercel deploy --prod --yes` — preset Nuxt detectado automaticamente**
- [ ] **Step 4: Smoke test na URL de produção (Playwright: abrir, ver painel demo, manifest 200, ícones 200)**
- [ ] **Step 5: Atualizar README com URL + passos de deploy; commit — `docs: deploy Vercel`**
- [ ] **Step 6: Instruções manuais ao usuário (fora do código):** no painel Supabase → Auth → Providers, ativar Google com Client ID/Secret do Google Cloud Console (OAuth consent + credencial Web, redirect `https://<ref>.supabase.co/auth/v1/callback`); em Auth → URL Configuration, adicionar `http://localhost:9100/**` e `https://<app>.vercel.app/**`.

---

## Self-Review

- Spec coverage: auth (T2), import local (T1/T2), CRUD+validações (T3), recorrência (T1/T3), relatório (T4), ícones (T5), deploy+env+URLs (T6). ✓
- Sem placeholders; código completo nos steps de código. ✓
- Tipos/nomes consistentes: `remove`, `markPaid`, `pushLocal`, `hasRealLocalBills`, `addMonthsClamped` usados igualmente em T1–T3. ✓
