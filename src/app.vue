<template>
  <q-layout view="hHh LpR fFf" class="app-shell mobile-first-app">
    <q-header class="topbar text-white">
      <q-toolbar class="topbar__inner">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <div class="brand-name">PROVISIONA</div>
          <div class="brand-caption">contas em dia, cabeça livre</div>
        </div>
        <q-space />
        <button class="sync-pill" :class="{ 'sync-pill--live': syncMode === 'supabase' }" @click="handleSync">
          <span></span>{{ syncMode === 'supabase' ? `Sincronizado · ${user?.email || ''}` : 'Modo demonstração' }}
        </button>
        <q-btn
          class="theme-toggle"
          round
          flat
          :icon="themeMode === 'dark' ? 'light_mode' : 'dark_mode'"
          :aria-label="themeMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'"
          @click="toggleTheme"
        >
          <q-tooltip>{{ themeMode === 'dark' ? 'Modo claro' : 'Modo escuro' }}</q-tooltip>
        </q-btn>
        <q-btn round flat :aria-label="user ? 'Conta conectada' : 'Entrar'" @click="handleSync">
          <q-avatar v-if="avatarUrl" size="30px"><img :src="avatarUrl" alt="Foto da conta Google" referrerpolicy="no-referrer"></q-avatar>
          <q-icon v-else :name="user ? 'how_to_reg' : 'account_circle'" />
          <q-tooltip>{{ user ? user.email : 'Entrar' }}</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <main class="workspace">
        <aside class="rail">
          <nav aria-label="Navegação principal">
            <button v-for="item in nav" :key="item.id" :class="['rail-link', { active: activeView === item.id }]" @click="activeView = item.id">
              <q-icon :name="item.icon" size="20px" /><span>{{ item.label }}</span>
              <b v-if="item.count">{{ item.count }}</b>
            </button>
          </nav>
          <div class="rail-note">
            <div class="rail-note__eyebrow mono">PRÓXIMA ROTINA</div>
            <strong>Conferir documentos</strong>
            <p>2 boletos aguardando localização.</p>
            <button @click="activeView = 'sources'">Ver origens <q-icon name="arrow_forward" /></button>
          </div>
          <q-btn class="new-bill" unelevated icon="add" label="Nova despesa" @click="openEditor()" />
        </aside>

        <q-btn class="mobile-fab" round unelevated icon="add" aria-label="Cadastrar nova despesa" @click="openEditor()" />

        <section class="content">
          <template v-if="activeView === 'dashboard'">
            <header class="page-heading reveal">
              <div><span class="eyebrow mono">VISÃO GERAL · JUL/AGO 2026</span><h1>O que precisa<br><em>acontecer agora.</em></h1></div>
              <div class="today mono">HOJE<br><b>19 JUL</b></div>
            </header>

            <section class="hero-grid reveal reveal--2">
              <article class="fund-card">
                <div class="fund-card__top"><span>NECESSÁRIO NO NUBANK</span><q-icon name="account_balance_wallet" /></div>
                <strong>{{ money(nubankNeed) }}</strong>
                <p>para cobrir {{ nubankBills.length }} compromissos em aberto</p>
                <div class="fund-progress"><span style="width: 38%"></span></div>
                <div class="fund-meta"><span>Saldo informado <b>{{ money(900) }}</b></span><span>Falta provisionar <b>{{ money(Math.max(nubankNeed - 900, 0)) }}</b></span></div>
              </article>
              <article class="action-card">
                <span class="mono">AÇÃO PRIORITÁRIA</span>
                <q-icon name="bolt" />
                <h2>{{ waitingDocuments }} documentos ainda não chegaram</h2>
                <p>O assistente procurará novamente no Gmail e WhatsApp amanhã às 08:00.</p>
                <button @click="activeView = 'sources'">Revisar fontes</button>
              </article>
            </section>

            <section class="section-block reveal reveal--3">
              <div class="section-title"><div><span class="mono">PRÓXIMOS VENCIMENTOS</span><h2>Linha de execução</h2></div><button @click="activeView = 'bills'">Ver todas</button></div>
              <div class="bill-list">
                <article v-for="bill in sortedBills.slice(0, 4)" :key="bill.id" class="bill-row" @click="openEditor(bill)">
                  <div class="date-tile"><b>{{ day(bill.dueDate) }}</b><span>{{ month(bill.dueDate) }}</span></div>
                  <div class="bill-main"><div class="bill-title"><strong>{{ bill.title }}</strong><span>{{ bill.category }}</span></div><small><q-icon :name="sourceIcon(bill.sourceChannel)" /> {{ bill.sourceChannel }} · {{ bill.sender }}</small></div>
                  <div class="bill-method"><span>{{ bill.paymentMethod }}</span><small>{{ bill.bankAccount }}</small></div>
                  <div class="bill-value"><strong>{{ money(bill.amount) }}</strong><span :class="['status', `status--${bill.status}`]">{{ statusLabel(bill.status) }}</span></div>
                  <q-btn v-if="bill.status !== 'paid'" class="row-pay" round flat icon="task_alt" aria-label="Marcar como paga" @click.stop="payBill(bill)"><q-tooltip>Marcar como paga</q-tooltip></q-btn>
                  <q-icon v-else name="chevron_right" class="row-arrow" />
                </article>
              </div>
            </section>

            <section class="message-preview reveal reveal--4">
              <div class="phone-card">
                <div class="phone-card__head"><q-icon name="chat" /><div><strong>Provisiona</strong><span>assistente · agora</span></div></div>
                <div class="chat-bubble">Olá, Carlos. Encontrei o boleto da <b>UVV</b> enviado por financeiro@uvv.br.<br><br><b>R$ 1.982,70</b> até 01/12 · vence 05/12.<div class="chat-actions"><button @click="copyDemoBarcode">Copiar código</button><button @click="openEditor(uvvBill)">Conferir</button></div></div>
              </div>
              <div class="message-copy"><span class="mono">ALERTAS QUE RESOLVEM</span><h2>Do lembrete<br>para a ação.</h2><p>Mensagens contextualizadas trazem remetente, valor correto, prazo do desconto e a próxima decisão — sem exigir que você abra o PDF novamente.</p><div class="message-stats"><div><b>D−7</b><span>procurar</span></div><div><b>D−1</b><span>provisionar</span></div><div><b>D+1</b><span>confirmar</span></div></div></div>
            </section>
          </template>

          <template v-else-if="activeView === 'bills'">
            <header class="sub-heading">
              <div><span class="eyebrow mono">CONTAS A PAGAR</span><h1>Todos os compromissos</h1></div>
              <q-btn v-if="billsTab === 'bills'" unelevated icon="add" label="Nova despesa" @click="openEditor()" />
              <q-btn v-else unelevated icon="add" label="Novo modelo" @click="openTemplateEditor()" />
            </header>
            <q-btn-toggle v-model="billsTab" class="bills-tab-toggle" unelevated toggle-color="dark" :options="[{ label: 'Ocorrências', value: 'bills' }, { label: 'Modelos', value: 'templates' }]" />
            <template v-if="billsTab === 'bills'">
              <div class="filters"><q-input v-model="search" outlined dense clearable placeholder="Buscar despesa ou remetente"><template #prepend><q-icon name="search" /></template></q-input><q-select v-model="statusFilter" outlined dense :options="statusOptions" emit-value map-options /></div>
              <div class="cards-grid"><article v-for="bill in filteredBills" :key="bill.id" class="compact-card" @click="openEditor(bill)"><div class="compact-card__top"><span :class="['status', `status--${bill.status}`]">{{ statusLabel(bill.status) }}</span><span class="mono">{{ formatDate(bill.dueDate) }}</span><q-btn v-if="bill.status !== 'paid'" dense round flat size="sm" icon="task_alt" aria-label="Marcar como paga" @click.stop="payBill(bill)"><q-tooltip>Marcar como paga</q-tooltip></q-btn></div><h3>{{ bill.title }}</h3><strong>{{ money(bill.amount) }}</strong><div class="compact-card__footer"><span><q-icon :name="sourceIcon(bill.sourceChannel)" /> {{ bill.sourceChannel }}</span><span>{{ bill.bankAccount }}</span></div></article></div>
            </template>
            <template v-else>
              <p class="templates-hint">Modelos geram as despesas do período automaticamente — cadastre uma vez e não precisa mais digitar boleto todo mês.</p>
              <div class="cards-grid"><article v-for="tpl in templates" :key="tpl.id" class="compact-card" :class="{ 'compact-card--inactive': !tpl.active }" @click="openTemplateEditor(tpl)"><div class="compact-card__top"><span class="status">{{ frequencyLabel(tpl.frequency) }}</span><span class="mono">DIA {{ tpl.dueDay }}</span></div><h3>{{ tpl.title }}</h3><strong>{{ tpl.nominalAmount ? money(tpl.nominalAmount) : 'valor variável' }}</strong><div class="compact-card__footer"><span><q-icon :name="sourceIcon(tpl.sourceChannel)" /> {{ tpl.sourceChannel }}</span><span>{{ tpl.bankAccount }}</span></div></article>
                <p v-if="!templates.length" class="empty-note">Nenhum modelo cadastrado. Crie um para a luz, telefone, cartão ou clube — o app gera as despesas do período sozinho.</p>
              </div>
            </template>
          </template>

          <template v-else-if="activeView === 'report'">
            <header class="sub-heading"><div><span class="eyebrow mono">RELATÓRIO</span><h1>Análise de gastos</h1></div><q-select v-model="reportMonth" outlined dense :options="monthOptions" emit-value map-options /></header>
            <section class="report-tiles">
              <article><span class="mono">TOTAL DO MÊS</span><strong>{{ money(monthTotal) }}</strong><small>{{ monthBills.length }} compromisso{{ monthBills.length === 1 ? '' : 's' }}</small></article>
              <article><span class="mono">PAGO</span><strong>{{ money(monthPaid) }}</strong><small>{{ Math.round(monthTotal ? (monthPaid / monthTotal) * 100 : 0) }}% executado</small></article>
              <article><span class="mono">EM ABERTO</span><strong>{{ money(monthTotal - monthPaid) }}</strong><small>a provisionar</small></article>
            </section>
            <section class="section-block">
              <div class="section-title"><div><span class="mono">LINHA DO TEMPO · 6 MESES</span><h2>Evolução</h2></div></div>
              <div class="trend-chart" role="img" aria-label="Total de despesas por mês na janela de seis meses">
                <button v-for="m in monthlySeries" :key="m.value" class="trend-col" :class="{ active: m.value === reportMonth }" :title="`${m.label} · ${money(m.total)}`" @click="reportMonth = m.value">
                  <span class="trend-value mono">{{ m.total ? money(m.total) : '—' }}</span>
                  <span class="trend-bar"><i :style="{ height: m.pct + '%' }"></i></span>
                  <span class="trend-label mono">{{ m.label }}</span>
                </button>
              </div>
            </section>
            <section class="section-block">
              <div class="section-title"><div><span class="mono">POR CATEGORIA</span><h2>Onde o dinheiro vai</h2></div></div>
              <div class="cat-list">
                <div v-for="cat in byCategory" :key="cat.name" class="cat-row"><span>{{ cat.name }}</span><span class="cat-bar"><i :style="{ width: cat.pct + '%' }"></i></span><b>{{ money(cat.total) }}</b></div>
                <p v-if="!byCategory.length" class="empty-note">Sem despesas neste mês.</p>
              </div>
            </section>
            <section class="section-block">
              <div class="section-title"><div><span class="mono">POR CONTA PAGADORA</span><h2>Saída por banco</h2></div></div>
              <div class="account-grid"><article v-for="acc in byAccount" :key="acc.name"><span class="mono">{{ acc.name.toUpperCase() }}</span><strong>{{ money(acc.total) }}</strong></article></div>
            </section>
          </template>

          <template v-else-if="activeView === 'sources'">
            <header class="sub-heading"><div><span class="eyebrow mono">ORIGENS E REMETENTES</span><h1>Onde cada boleto chega</h1></div></header>
            <div class="source-grid"><article v-for="source in sourceGroups" :key="source.name" class="source-card"><q-icon :name="sourceIcon(source.name)" /><div><span class="mono">{{ source.count }} DESPESA{{ source.count > 1 ? 'S' : '' }}</span><h2>{{ source.name }}</h2><p>{{ source.description }}</p></div><div class="source-list"><div v-for="bill in source.bills" :key="bill.id"><span>{{ bill.title }}</span><small>{{ bill.sender }}</small></div></div></article></div>
          </template>

          <template v-else>
            <header class="sub-heading"><div><span class="eyebrow mono">CENTRAL DE ALERTAS</span><h1>Mensagens programadas</h1></div></header>
            <div class="timeline"><article v-for="alert in alerts" :key="alert.title"><div class="timeline__dot"><q-icon :name="alert.icon" /></div><div><span class="mono">{{ alert.when }}</span><h3>{{ alert.title }}</h3><p>{{ alert.text }}</p></div><q-toggle v-model="alert.enabled" color="dark" /></article></div>
          </template>
        </section>
      </main>
    </q-page-container>

    <q-dialog v-model="editorOpen" :position="$q.screen.gt.sm ? 'right' : 'bottom'" :full-height="$q.screen.gt.sm">
      <q-card class="editor-card">
        <q-card-section class="editor-head"><div><span class="mono">{{ draft.id ? 'EDITAR COMPROMISSO' : 'NOVO COMPROMISSO' }}</span><h2>{{ draft.id ? draft.title : 'Cadastrar despesa' }}</h2></div><q-btn round flat icon="close" v-close-popup /></q-card-section>
        <q-card-section class="editor-body q-gutter-y-md">
          <div class="form-section"><span class="mono">01 · COBRANÇA</span><div class="form-grid"><q-input v-model="draft.title" outlined label="Nome da despesa" class="span-2" lazy-rules :rules="[v => (!!v && v.trim().length >= 2 && v.trim().length <= 120) || 'Entre 2 e 120 caracteres']" /><q-input v-model="amountText" outlined type="text" inputmode="decimal" prefix="R$" label="Valor para pagamento" hint="Deixe em branco se ainda não sabe" lazy-rules :rules="[v => { const n = parseCurrencyInput(v); return v === '' || (n !== null && n >= 0) || 'Valor não pode ser negativo' }]" @blur="onAmountBlur" /><q-input v-model="nominalAmountText" outlined type="text" inputmode="decimal" prefix="R$" label="Valor nominal" @blur="onNominalAmountBlur" /><q-input v-model="draft.dueDate" outlined type="date" label="Vencimento" stack-label lazy-rules :rules="[v => !!v || 'Informe o vencimento']" /><q-input v-model="draft.discountUntil" outlined type="date" label="Desconto até" stack-label /><q-input v-model="draft.payerName" outlined label="Pagador no boleto" /><q-select v-model="draft.category" outlined label="Categoria" :options="categories" /></div></div>
          <div class="form-section"><span class="mono">02 · ONDE LOCALIZAR</span><div class="form-grid"><q-select v-model="draft.sourceChannel" outlined label="Fonte" :options="sourceOptions" /><q-input v-model="draft.sender" outlined label="Remetente esperado" /><q-input v-model="draft.locatorHint" outlined label="Assunto, contato ou regra de busca" class="span-2" /></div></div>
          <div class="form-section"><span class="mono">03 · EXECUÇÃO</span><div class="form-grid"><q-select v-model="draft.paymentMethod" outlined label="Forma de pagamento" :options="paymentOptions" /><q-select v-model="draft.bankAccount" outlined label="Conta pagadora" :options="['Nubank', 'CAIXA']" /><q-select v-model="draft.status" outlined label="Situação" :options="statusOptions" emit-value map-options /><q-input v-model="draft.documentExpectedAt" outlined type="date" label="Documento esperado" stack-label /><q-input v-model="draft.barcode" outlined autogrow label="Linha digitável" class="span-2"><template #append><q-btn v-if="draft.barcode" flat round icon="content_copy" @click="copy(draft.barcode)" /></template></q-input></div></div>
        </q-card-section>
        <q-card-actions class="editor-actions"><q-btn v-if="draft.id" flat color="negative" icon="delete_outline" label="Excluir" @click="confirmRemove" /><q-btn flat label="Cancelar" v-close-popup /><q-space /><q-btn unelevated color="dark" label="Salvar compromisso" icon-right="arrow_forward" @click="saveDraft" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="templateOpen" :position="$q.screen.gt.sm ? 'right' : 'bottom'" :full-height="$q.screen.gt.sm">
      <q-card class="editor-card">
        <q-card-section class="editor-head"><div><span class="mono">{{ tplDraft.id ? 'EDITAR MODELO' : 'NOVO MODELO' }}</span><h2>{{ tplDraft.id ? tplDraft.title : 'Cadastrar recorrência' }}</h2></div><q-btn round flat icon="close" v-close-popup /></q-card-section>
        <q-card-section class="editor-body q-gutter-y-md">
          <div class="form-section"><span class="mono">01 · RECORRÊNCIA</span><div class="form-grid">
            <q-input v-model="tplDraft.title" outlined label="Nome da despesa" class="span-2" lazy-rules :rules="[v => (!!v && v.trim().length >= 2 && v.trim().length <= 120) || 'Entre 2 e 120 caracteres']" />
            <q-select v-model="tplDraft.frequency" outlined label="Frequência" :options="frequencyOptions" emit-value map-options />
            <q-input v-model.number="tplDraft.dueDay" outlined type="number" min="1" max="31" label="Dia do vencimento" />
            <q-input v-model="tplDraft.anchorMonth" outlined type="month" label="Mês de referência" stack-label hint="Um mês em que a despesa é devida" />
            <q-input v-model="tplAmountText" outlined type="text" inputmode="decimal" prefix="R$" label="Valor habitual (opcional)" hint="Deixe em branco se o valor varia" @blur="onTplAmountBlur" />
            <q-select v-model="tplDraft.category" outlined label="Categoria" :options="categories" />
          </div></div>
          <div class="form-section"><span class="mono">02 · ONDE LOCALIZAR</span><div class="form-grid">
            <q-select v-model="tplDraft.sourceChannel" outlined label="Fonte" :options="sourceOptions" />
            <q-input v-model="tplDraft.sender" outlined label="Remetente esperado" />
            <q-input v-model="tplDraft.locatorHint" outlined label="Assunto, contato ou regra de busca" class="span-2" />
          </div></div>
          <div class="form-section"><span class="mono">03 · EXECUÇÃO</span><div class="form-grid">
            <q-select v-model="tplDraft.paymentMethod" outlined label="Forma de pagamento" :options="paymentOptions" />
            <q-select v-model="tplDraft.bankAccount" outlined label="Conta pagadora" :options="['Nubank', 'CAIXA']" />
            <q-toggle v-model="tplDraft.active" label="Modelo ativo (gera despesas)" class="span-2" />
          </div></div>
        </q-card-section>
        <q-card-actions class="editor-actions"><q-btn v-if="tplDraft.id" flat color="negative" icon="delete_outline" label="Excluir" @click="confirmRemoveTemplate" /><q-btn flat label="Cancelar" v-close-popup /><q-space /><q-btn unelevated color="dark" label="Salvar modelo" icon-right="arrow_forward" @click="saveTplDraft" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="authOpen">
      <q-card class="auth-card">
        <template v-if="!user">
          <q-card-section><span class="mono">SINCRONIZAÇÃO SEGURA</span><h2>Entrar no Provisiona</h2><p>Seus compromissos ficam protegidos por usuário (RLS). Nenhuma senha bancária é armazenada.</p></q-card-section>
          <q-card-section class="q-gutter-y-sm">
            <q-btn class="google-btn full-width" unelevated icon="login" label="Entrar com Google" :loading="authBusy" @click="loginGoogle" />
            <div class="auth-divider mono">OU RECEBA UM LINK POR E-MAIL</div>
            <q-input v-model="authEmail" outlined type="email" label="Seu e-mail" @keyup.enter="sendMagicLink" />
          </q-card-section>
          <q-card-actions align="right"><q-btn flat label="Cancelar" v-close-popup /><q-btn unelevated color="dark" label="Enviar link" @click="sendMagicLink" /></q-card-actions>
        </template>
        <template v-else>
          <q-card-section class="account-head"><q-avatar v-if="avatarUrl" size="52px"><img :src="avatarUrl" alt="Foto da conta Google" referrerpolicy="no-referrer"></q-avatar><q-avatar v-else size="52px" icon="how_to_reg" color="dark" text-color="white" /><div><span class="mono">CONTA CONECTADA</span><h2>{{ user.user_metadata?.full_name || 'Sua conta' }}</h2><p>{{ user.email }} · sincronizando com Supabase.</p></div></q-card-section>
          <q-card-actions align="right"><q-btn flat label="Fechar" v-close-popup /><q-btn outline color="negative" label="Sair" @click="logout" /></q-card-actions>
        </template>
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { copyToClipboard, useQuasar } from 'quasar'
import { useBills } from './composables/useBills'
import { useAuth } from './composables/useAuth'
import { FREQUENCY_LABELS, useTemplates } from './composables/useTemplates'
import { parseBoleto } from './utils/boleto'
import { formatCurrencyInput, parseCurrencyInput } from './utils/currency'

const $q = useQuasar()
const { $supabase: supabase, $isSupabaseConfigured: isSupabaseConfigured } = useNuxtApp()
const storedTheme = window.localStorage.getItem('provisiona:theme')
const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
const themeMode = ref(storedTheme || systemTheme)
$q.dark.set(themeMode.value === 'dark')
const { sortedBills, syncMode, nubankNeed, waitingDocuments, scheduled, hasRealLocalBills, load, save, remove, markPaid, materialize, pushLocal, goLocal } = useBills()
const { templates, activeTemplates, loadTemplates, saveTemplate, removeTemplate, pushLocalTemplates, goLocalTemplates } = useTemplates()
const { user, init: initAuth, signInWithGoogle, signInWithEmail, signOut } = useAuth()
const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url || user.value?.user_metadata?.picture || '')
const activeView = ref('dashboard')
const editorOpen = ref(false)
const authOpen = ref(false)
const authEmail = ref('')
const authBusy = ref(false)
const search = ref('')
const statusFilter = ref('all')
const blankBill = () => ({ title: '', category: 'Moradia', amount: null, nominalAmount: null, dueDate: '', documentExpectedAt: '', discountUntil: '', payerName: '', sourceChannel: 'Gmail', sender: '', locatorHint: '', paymentMethod: 'Boleto', bankAccount: 'Nubank', status: 'waiting_document', barcode: '', recurring: true, templateId: null, period: null })
const draft = reactive(blankBill())
const amountText = ref('')
const nominalAmountText = ref('')
const billsTab = ref('bills')
const templateOpen = ref(false)
const currentMonthValue = () => new Date().toISOString().slice(0, 7)
const blankTemplate = () => ({ title: '', category: 'Moradia', frequency: 'monthly', dueDay: 10, anchorMonth: currentMonthValue(), nominalAmount: null, payerName: '', sourceChannel: 'Gmail', sender: '', locatorHint: '', paymentMethod: 'Boleto', bankAccount: 'Nubank', active: true })
const tplDraft = reactive(blankTemplate())
const tplAmountText = ref('')
const frequencyOptions = Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))
const frequencyLabel = (value) => FREQUENCY_LABELS[value] || value
const categories = ['Moradia', 'Educação', 'Saúde', 'Comunicação', 'Assinaturas', 'Impostos', 'Outros']
const sourceOptions = ['Gmail', 'WhatsApp', 'DDA Nubank', 'Portal', 'Aplicativo', 'Outro']
const paymentOptions = ['Boleto', 'Débito automático', 'Pix']
const statusOptions = [{ label: 'Todos os status', value: 'all' }, { label: 'Aguardando documento', value: 'waiting_document' }, { label: 'Documento localizado', value: 'document_found' }, { label: 'Agendado', value: 'scheduled' }, { label: 'Pago', value: 'paid' }]
const nav = computed(() => [
  { id: 'dashboard', label: 'Visão geral', icon: 'space_dashboard' },
  { id: 'bills', label: 'Contas a pagar', icon: 'receipt_long', count: sortedBills.value.length },
  { id: 'report', label: 'Relatório', icon: 'insights' },
  { id: 'sources', label: 'Fontes', icon: 'alternate_email', count: waitingDocuments.value },
  { id: 'alerts', label: 'Alertas', icon: 'forum', count: scheduled.value },
])

const reportMonth = ref(new Date().toISOString().slice(0, 7))
const monthOptions = computed(() => {
  const out = []
  const now = new Date()
  for (const offset of [2, 1, 0, -1, -2, -3]) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1))
    const value = d.toISOString().slice(0, 7)
    out.push({ value, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) })
  }
  return out
})
const monthBills = computed(() => sortedBills.value.filter((bill) => bill.dueDate.startsWith(reportMonth.value)))
const monthTotal = computed(() => monthBills.value.reduce((sum, bill) => sum + Number(bill.amount || 0), 0))
const monthPaid = computed(() => monthBills.value.filter((b) => b.status === 'paid').reduce((s, b) => s + Number(b.amount || 0), 0))
const byCategory = computed(() => {
  const map = {}
  for (const bill of monthBills.value) map[bill.category] = (map[bill.category] || 0) + Number(bill.amount || 0)
  const max = Math.max(...Object.values(map), 1)
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total, pct: Math.round((total / max) * 100) }))
})
const byAccount = computed(() => ['Nubank', 'CAIXA'].map((name) => ({ name, total: monthBills.value.filter((b) => b.bankAccount === name).reduce((s, b) => s + Number(b.amount || 0), 0) })))
const monthlySeries = computed(() => {
  const out = monthOptions.value.map(({ value, label }) => ({
    value,
    label: label.split(' ')[0].slice(0, 3).toUpperCase(),
    total: sortedBills.value.filter((b) => b.dueDate.startsWith(value)).reduce((s, b) => s + Number(b.amount || 0), 0),
  })).reverse()
  const max = Math.max(...out.map((m) => m.total), 1)
  return out.map((m) => ({ ...m, pct: Math.max(Math.round((m.total / max) * 100), m.total > 0 ? 4 : 0) }))
})
const nubankBills = computed(() => sortedBills.value.filter((bill) => bill.bankAccount === 'Nubank' && bill.status !== 'paid'))
const uvvBill = computed(() => sortedBills.value.find((bill) => bill.id === 'demo-uvv'))
const filteredBills = computed(() => sortedBills.value.filter((bill) => {
  const term = search.value.toLowerCase()
  return (!term || `${bill.title} ${bill.sender}`.toLowerCase().includes(term)) && (statusFilter.value === 'all' || bill.status === statusFilter.value)
}))
const descriptions = { Gmail: 'Busca por remetente, assunto, período e anexos.', WhatsApp: 'Recebe documentos encaminhados ao assistente.', 'DDA Nubank': 'Identifica cobranças emitidas no seu CPF.', Portal: 'Mantém instruções e prazo para consulta manual.' }
const sourceGroups = computed(() => [...new Set(sortedBills.value.map((bill) => bill.sourceChannel))].map((name) => { const grouped = sortedBills.value.filter((bill) => bill.sourceChannel === name); return { name, count: grouped.length, description: descriptions[name] || 'Fonte cadastrada para consulta.', bills: grouped } }))
const alerts = reactive([
  { when: 'D−7 · 08:00', title: 'Procurar documento', text: 'Busca nas fontes cadastradas e avisa quando não encontrar.', icon: 'search', enabled: true },
  { when: 'D−1 · 09:00', title: 'Provisionar saldo', text: 'Informa o total necessário por conta pagadora.', icon: 'account_balance_wallet', enabled: true },
  { when: 'DIA D · 08:00', title: 'Confirmar execução', text: 'Mostra pagamento agendado, código e próxima ação.', icon: 'task_alt', enabled: true },
  { when: 'D+1 · 10:00', title: 'Cobrar confirmação', text: 'Só envia se a despesa ainda estiver pendente.', icon: 'notification_important', enabled: false },
])

function openEditor(bill) {
  Object.assign(draft, blankBill(), bill ? { ...bill } : {})
  amountText.value = formatCurrencyInput(draft.amount)
  nominalAmountText.value = formatCurrencyInput(draft.nominalAmount)
  editorOpen.value = true
}
function onAmountBlur() { draft.amount = parseCurrencyInput(amountText.value); amountText.value = formatCurrencyInput(draft.amount) }
function onNominalAmountBlur() { draft.nominalAmount = parseCurrencyInput(nominalAmountText.value); nominalAmountText.value = formatCurrencyInput(draft.nominalAmount) }
async function saveDraft() {
  onAmountBlur()
  onNominalAmountBlur()
  const title = (draft.title || '').trim()
  if (title.length < 2 || title.length > 120) return $q.notify({ type: 'warning', message: 'Nome deve ter entre 2 e 120 caracteres.' })
  if (draft.amount !== null && draft.amount !== '' && Number(draft.amount) < 0) return $q.notify({ type: 'warning', message: 'Valor não pode ser negativo.' })
  if (!draft.dueDate) return $q.notify({ type: 'warning', message: 'Informe o vencimento.' })
  try { await save({ ...draft, title }); editorOpen.value = false; $q.notify({ color: 'dark', textColor: 'white', icon: 'done', message: 'Compromisso salvo.' }) }
  catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}

function confirmRemove() {
  $q.dialog({
    title: 'Excluir compromisso?',
    message: `"${draft.title}" será removido${syncMode.value === 'supabase' ? ' também do Supabase' : ''}.`,
    ok: { label: 'Excluir', color: 'negative', unelevated: true },
    cancel: { label: 'Manter', flat: true },
  }).onOk(async () => {
    try { await remove(draft.id); editorOpen.value = false; $q.notify({ color: 'dark', icon: 'delete', message: 'Compromisso excluído.' }) }
    catch (error) { $q.notify({ type: 'negative', message: error.message }) }
  })
}

async function payBill(bill) {
  try {
    await markPaid(bill.id)
    $q.notify({ color: 'dark', textColor: 'white', icon: 'task_alt', message: 'Marcada como paga.' })
  } catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}

function openTemplateEditor(tpl) {
  Object.assign(tplDraft, blankTemplate(), tpl ? { ...tpl } : {})
  tplAmountText.value = formatCurrencyInput(tplDraft.nominalAmount)
  templateOpen.value = true
}
function onTplAmountBlur() { tplDraft.nominalAmount = parseCurrencyInput(tplAmountText.value); tplAmountText.value = formatCurrencyInput(tplDraft.nominalAmount) }

async function saveTplDraft() {
  onTplAmountBlur()
  const title = (tplDraft.title || '').trim()
  if (title.length < 2 || title.length > 120) return $q.notify({ type: 'warning', message: 'Nome deve ter entre 2 e 120 caracteres.' })
  const day = Number(tplDraft.dueDay)
  if (!Number.isInteger(day) || day < 1 || day > 31) return $q.notify({ type: 'warning', message: 'Dia do vencimento deve ser entre 1 e 31.' })
  if (!/^\d{4}-\d{2}$/.test(tplDraft.anchorMonth || '')) return $q.notify({ type: 'warning', message: 'Informe o mês de referência.' })
  try {
    await saveTemplate({ ...tplDraft, title, dueDay: day })
    templateOpen.value = false
    $q.notify({ color: 'dark', textColor: 'white', icon: 'done', message: 'Modelo salvo.' })
    await runMaterialize()
  } catch (error) { $q.notify({ type: 'negative', message: error.message }) }
}

function confirmRemoveTemplate() {
  $q.dialog({
    title: 'Excluir modelo?',
    message: `"${tplDraft.title}" deixa de gerar novas despesas. As já geradas permanecem.`,
    ok: { label: 'Excluir', color: 'negative', unelevated: true },
    cancel: { label: 'Manter', flat: true },
  }).onOk(async () => {
    try { await removeTemplate(tplDraft.id); templateOpen.value = false; $q.notify({ color: 'dark', icon: 'delete', message: 'Modelo excluído.' }) }
    catch (error) { $q.notify({ type: 'negative', message: error.message }) }
  })
}

watch(() => draft.barcode, (value, old) => {
  if (!value || value === old || !editorOpen.value) return
  const parsed = parseBoleto(value)
  if (!parsed) return
  let filled = []
  if (parsed.amount !== null) { draft.amount = parsed.amount; amountText.value = formatCurrencyInput(parsed.amount); filled.push('valor') }
  if (parsed.dueDate) { draft.dueDate = parsed.dueDate; filled.push('vencimento') }
  if (filled.length && draft.status === 'waiting_document') draft.status = 'document_found'
  if (filled.length) $q.notify({ color: 'dark', textColor: 'white', icon: 'qr_code_scanner', message: `Boleto lido: ${filled.join(' e ')} preenchido${filled.length > 1 ? 's' : ''}.` })
})
function copy(value) { copyToClipboard(value).then(() => $q.notify({ color: 'dark', message: 'Código copiado.', icon: 'content_copy' })) }
function copyDemoBarcode() { if (uvvBill.value?.barcode) copy(uvvBill.value.barcode) }
function handleSync() {
  if (!isSupabaseConfigured) return $q.notify({ color: 'dark', message: 'Configure o arquivo .env para conectar ao Supabase.', icon: 'settings' })
  authOpen.value = true
}
function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark'
  $q.dark.set(themeMode.value === 'dark')
  window.localStorage.setItem('provisiona:theme', themeMode.value)
}
async function sendMagicLink() {
  if (!authEmail.value) return
  try {
    await signInWithEmail(authEmail.value)
    authOpen.value = false
    $q.notify({ color: 'dark', icon: 'mark_email_read', message: 'Link de acesso enviado.' })
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message })
  }
}

async function loginGoogle() {
  authBusy.value = true
  try {
    await signInWithGoogle()
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message })
    authBusy.value = false
  }
}

async function logout() {
  try {
    await signOut()
    goLocal()
    goLocalTemplates()
    authOpen.value = false
    $q.notify({ color: 'dark', icon: 'logout', message: 'Sessão encerrada. Modo local ativo.' })
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message })
  }
}

async function runMaterialize() {
  try {
    const created = await materialize(activeTemplates.value)
    if (created.length) $q.notify({ color: 'dark', textColor: 'white', icon: 'event_repeat', message: `${created.length} despesa${created.length > 1 ? 's' : ''} do período gerada${created.length > 1 ? 's' : ''} dos modelos.` })
  } catch (error) {
    $q.notify({ type: 'warning', message: `Recorrências: ${error.message}` })
  }
}

async function syncAll() {
  await load()
  await loadTemplates()
  await runMaterialize()
}

async function importAll() {
  await pushLocal()
  await pushLocalTemplates()
  await runMaterialize()
}

async function handleSession() {
  const { count, error } = await supabase.from('bills').select('id', { count: 'exact', head: true })
  if (error) return $q.notify({ type: 'warning', message: `Supabase: ${error.message}` })
  if (count === 0 && hasRealLocalBills.value) {
    $q.dialog({
      title: 'Importar dados locais?',
      message: 'Sua conta está vazia. Enviar os compromissos criados neste aparelho para o Supabase?',
      ok: { label: 'Importar', color: 'dark', unelevated: true },
      cancel: { label: 'Começar do zero', flat: true },
      persistent: true,
    })
      .onOk(() => importAll().catch((e) => $q.notify({ type: 'negative', message: e.message })))
      .onCancel(() => syncAll().catch((e) => $q.notify({ type: 'negative', message: e.message })))
  } else {
    await syncAll().catch((e) => $q.notify({ type: 'negative', message: e.message }))
  }
  authOpen.value = false
}
const money = (value) => value === null || value === '' ? 'a definir' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—'
const day = (value) => value.slice(8, 10)
const month = (value) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)).replace('.', '').toUpperCase()
const statusLabel = (status) => ({ waiting_document: 'Aguardando', document_found: 'Localizado', scheduled: 'Agendado', paid: 'Pago' }[status] || status)
const sourceIcon = (source) => ({ Gmail: 'mail', WhatsApp: 'chat', 'DDA Nubank': 'account_balance', Portal: 'language', Aplicativo: 'apps' }[source] || 'folder')
onMounted(() => {
  initAuth(handleSession)
  if (!user.value) runMaterialize()
})
</script>

<style scoped>
.app-shell { min-height: 100vh; }
.topbar { background: var(--ink); height: 74px; box-shadow: none; }
.topbar__inner { max-width: 1480px; height: 74px; margin: auto; padding: 0 28px; gap: 13px; }
.brand-mark { width: 30px; height: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; transform: rotate(-8deg); }
.brand-mark span { background: var(--acid); border-radius: 2px; }.brand-mark span:nth-child(2) { transform: translateY(5px); }.brand-mark span:nth-child(3) { transform: translateY(-3px); background: var(--peach); }
.brand-name { font-weight: 800; letter-spacing: .16em; font-size: 14px; }.brand-caption { color: #aeb8b3; font-size: 10px; letter-spacing: .04em; }
.sync-pill { display: flex; align-items: center; gap: 7px; border: 1px solid rgba(255,255,255,.15); background: transparent; border-radius: 999px; padding: 7px 11px; font: 11px 'DM Mono'; color: #cbd2ce; cursor: pointer; }.sync-pill span { width: 7px; height: 7px; background: #e8a86d; border-radius: 50%; }.sync-pill--live span { background: var(--acid); }
.workspace { max-width: 1480px; margin: auto; display: grid; grid-template-columns: 230px minmax(0,1fr); min-height: calc(100vh - 74px); }
.rail { padding: 34px 20px 28px; border-right: 1px solid var(--line); display: flex; flex-direction: column; position: sticky; top: 74px; height: calc(100vh - 74px); }
.rail nav { display: grid; gap: 5px; }.rail-link { border: 0; background: transparent; color: #65706b; border-radius: 10px; padding: 12px; display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; text-align: left; cursor: pointer; align-items: center; font-weight: 600; }.rail-link:hover { background: rgba(23,37,31,.05); }.rail-link.active { background: var(--ink); color: white; }.rail-link b { font: 10px 'DM Mono'; background: var(--acid); color: var(--ink); padding: 3px 6px; border-radius: 99px; }
.rail-note { margin-top: auto; border-top: 1px solid var(--line); padding: 23px 10px; }.rail-note__eyebrow { color: #7c8781; font-size: 9px; margin-bottom: 8px; }.rail-note strong { font-size: 13px; }.rail-note p { font-size: 11px; color: var(--muted); line-height: 1.5; }.rail-note button, .section-title button { border: 0; background: transparent; padding: 0; font-weight: 700; cursor: pointer; color: var(--ink); }
.new-bill { background: var(--acid); color: var(--ink); border-radius: 10px; font-weight: 800; height: 46px; }
.content { min-width: 0; padding: 48px clamp(24px, 5vw, 78px) 80px; }
.page-heading, .sub-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; }.eyebrow { font-size: 10px; color: var(--muted); letter-spacing: .12em; }.page-heading h1, .sub-heading h1 { margin: 10px 0 0; font-size: clamp(38px, 5vw, 68px); line-height: .98; letter-spacing: -.055em; }.page-heading h1 em { font-family: Georgia, serif; font-weight: 400; color: #526059; }.today { border-left: 2px solid var(--ink); padding-left: 13px; font-size: 9px; color: var(--muted); }.today b { font-size: 16px; color: var(--ink); }
.hero-grid { display: grid; grid-template-columns: 1.45fr .85fr; gap: 18px; }.fund-card, .action-card { border-radius: 20px; padding: 27px; min-height: 245px; }.fund-card { background: var(--ink); color: white; }.fund-card__top { display: flex; justify-content: space-between; color: #b9c2bd; font: 10px 'DM Mono'; letter-spacing: .08em; }.fund-card > strong { font-size: clamp(42px, 6vw, 74px); letter-spacing: -.06em; display: block; margin-top: 21px; }.fund-card > p { color: #aeb8b3; font-size: 12px; }.fund-progress { height: 5px; background: rgba(255,255,255,.13); margin: 24px 0 14px; }.fund-progress span { display: block; background: var(--acid); height: 100%; }.fund-meta { display: flex; justify-content: space-between; font-size: 10px; color: #aeb8b3; }.fund-meta b { display: block; color: white; margin-top: 4px; font-size: 13px; }
.action-card { background: var(--peach); position: relative; overflow: hidden; }.action-card::after { content: ''; position: absolute; width: 130px; height: 130px; border: 1px solid rgba(23,37,31,.3); border-radius: 50%; right: -45px; top: -45px; box-shadow: 0 0 0 25px rgba(23,37,31,.04), 0 0 0 50px rgba(23,37,31,.03); }.action-card > span { font: 10px 'DM Mono'; }.action-card > .q-icon { position: absolute; right: 25px; top: 26px; font-size: 30px; }.action-card h2 { font-size: 24px; line-height: 1.15; margin: 45px 0 10px; max-width: 320px; }.action-card p { font-size: 11px; line-height: 1.5; max-width: 300px; }.action-card button { border: 0; border-bottom: 1px solid; background: transparent; padding: 5px 0; font-weight: 800; cursor: pointer; }
.section-block { margin-top: 44px; }.section-title { display: flex; justify-content: space-between; align-items: end; margin-bottom: 15px; }.section-title span { font-size: 9px; color: var(--muted); }.section-title h2 { margin: 4px 0 0; font-size: 25px; }.bill-list { border-top: 1px solid var(--ink); }.bill-row { display: grid; grid-template-columns: 58px minmax(220px,1fr) 130px 145px 20px; align-items: center; gap: 18px; border-bottom: 1px solid var(--line); padding: 15px 4px; cursor: pointer; transition: .2s ease; }.bill-row:hover { background: rgba(255,255,255,.55); padding-left: 10px; }.date-tile { background: white; border: 1px solid var(--line); padding: 7px; text-align: center; }.date-tile b { font-size: 19px; display: block; line-height: 1; }.date-tile span { font: 9px 'DM Mono'; }.bill-title { display: flex; gap: 10px; align-items: baseline; }.bill-title strong { font-size: 15px; }.bill-title span { color: var(--muted); font-size: 10px; }.bill-main small { color: var(--muted); font-size: 10px; }.bill-method span, .bill-method small { display: block; font-size: 11px; }.bill-method small { color: var(--muted); }.bill-value { text-align: right; }.bill-value strong { display: block; font-size: 15px; }.status { display: inline-flex; margin-top: 5px; font: 8px 'DM Mono'; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px; background: #e5e2d9; border-radius: 4px; }.status--document_found { background: #dff0c5; }.status--scheduled { background: #d7e9f2; }.status--paid { background: var(--acid); }.status--waiting_document { background: #f4d3bd; }.row-arrow { color: var(--muted); }.row-pay { color: var(--muted); }.row-pay:hover { color: var(--ink); }
.message-preview { margin-top: 55px; background: #dbe4dd; padding: 35px; border-radius: 22px; display: grid; grid-template-columns: .9fr 1fr; gap: 55px; align-items: center; }.phone-card { background: #efece4; border: 7px solid var(--ink); border-radius: 25px; padding: 18px; max-width: 350px; box-shadow: 11px 12px 0 rgba(23,37,31,.16); transform: rotate(-1deg); }.phone-card__head { display: flex; gap: 9px; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 12px; }.phone-card__head > .q-icon { background: #25d366; border-radius: 50%; color: white; padding: 7px; }.phone-card__head strong, .phone-card__head span { display: block; font-size: 11px; }.phone-card__head span { color: var(--muted); font-size: 8px; }.chat-bubble { margin: 18px 0 4px 20px; background: #d8fdd2; padding: 14px; border-radius: 10px 2px 10px 10px; font-size: 11px; line-height: 1.45; }.chat-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 12px; }.chat-actions button { border: 1px solid #7baf77; background: transparent; border-radius: 5px; font-size: 9px; padding: 7px; cursor: pointer; }.message-copy > span { font-size: 9px; }.message-copy h2 { font-family: Georgia, serif; font-size: 40px; line-height: 1; margin: 10px 0 15px; font-weight: 400; }.message-copy p { font-size: 12px; line-height: 1.7; max-width: 480px; }.message-stats { display: flex; gap: 25px; margin-top: 25px; }.message-stats div { border-left: 1px solid; padding-left: 10px; }.message-stats b, .message-stats span { display: block; }.message-stats b { font: 14px 'DM Mono'; }.message-stats span { font-size: 9px; color: var(--muted); }
.bills-tab-toggle { margin-bottom: 18px; }
.templates-hint { color: var(--muted); font-size: 12px; max-width: 520px; margin-bottom: 18px; }
.compact-card--inactive { opacity: .55; }
.sub-heading { align-items: end; }.sub-heading h1 { font-size: clamp(34px, 4vw, 54px); }.sub-heading .q-btn { background: var(--acid); color: var(--ink); font-weight: 800; }.filters { display: grid; grid-template-columns: minmax(240px,1fr) 240px; gap: 12px; margin-bottom: 24px; }.cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.compact-card { background: rgba(255,255,255,.66); border: 1px solid var(--line); padding: 20px; border-radius: 15px; cursor: pointer; min-height: 190px; transition: .2s ease; }.compact-card:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(23,37,31,.09); }.compact-card__top, .compact-card__footer { display: flex; justify-content: space-between; align-items: center; }.compact-card__top .mono { font-size: 9px; }.compact-card h3 { margin: 26px 0 3px; font-size: 17px; }.compact-card > strong { font-size: 26px; }.compact-card__footer { border-top: 1px solid var(--line); padding-top: 13px; margin-top: 22px; font-size: 10px; color: var(--muted); }
.source-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }.source-card { border: 1px solid var(--line); background: rgba(255,255,255,.55); border-radius: 18px; padding: 24px; display: grid; grid-template-columns: 45px 1fr; gap: 15px; }.source-card > .q-icon { background: var(--ink); color: var(--acid); padding: 10px; border-radius: 10px; font-size: 24px; }.source-card .mono { font-size: 8px; color: var(--muted); }.source-card h2 { margin: 4px 0; }.source-card p { color: var(--muted); font-size: 11px; }.source-list { grid-column: 1/-1; border-top: 1px solid var(--line); }.source-list div { display: flex; justify-content: space-between; gap: 15px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 11px; }.source-list small { color: var(--muted); text-align: right; }
.timeline { max-width: 780px; }.timeline article { display: grid; grid-template-columns: 48px 1fr auto; gap: 16px; align-items: start; border-bottom: 1px solid var(--line); padding: 20px 0; }.timeline__dot { width: 42px; height: 42px; border: 1px solid var(--ink); display: grid; place-items: center; border-radius: 50%; }.timeline .mono { font-size: 9px; color: var(--muted); }.timeline h3 { margin: 4px 0; }.timeline p { color: var(--muted); margin: 0; font-size: 11px; }
.editor-card { width: min(680px, 100vw); border-radius: 22px 0 0 22px !important; display: flex; flex-direction: column; }.editor-head { background: var(--ink); color: white; display: flex; justify-content: space-between; align-items: center; padding: 24px 28px; }.editor-head .mono { color: var(--acid); font-size: 9px; }.editor-head h2 { margin: 4px 0 0; font-size: 25px; }.editor-body { flex: 1; overflow: auto; padding: 26px 28px; background: var(--paper); }.form-section { margin-bottom: 25px; }.form-section > .mono { display: block; font-size: 9px; font-weight: 500; margin-bottom: 12px; }.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.span-2 { grid-column: 1/-1; }.editor-actions { border-top: 1px solid var(--line); padding: 14px 24px; background: white; }
.auth-card { width: min(440px, 92vw); padding: 16px; }.google-btn { background: var(--ink); color: white; }.auth-divider { text-align: center; font-size: 9px; color: var(--muted); margin: 10px 0 2px; }
.account-head { display: flex; gap: 16px; align-items: center; }.account-head .q-avatar { flex-shrink: 0; }.account-head img { object-fit: cover; }
.report-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.report-tiles article { background: var(--surface, rgba(255,255,255,.66)); border: 1px solid var(--line); border-radius: 15px; padding: 18px 20px; }.report-tiles .mono { font-size: 9px; color: var(--muted); }.report-tiles strong { display: block; font-size: clamp(20px, 2.6vw, 30px); letter-spacing: -.03em; margin: 8px 0 2px; }.report-tiles small { color: var(--muted); font-size: 10px; }
.trend-chart { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; align-items: end; border-top: 1px solid var(--ink); padding-top: 18px; }
.trend-col { display: flex; flex-direction: column; align-items: center; gap: 7px; border: 0; background: transparent; padding: 0; cursor: pointer; color: var(--text); }
.trend-value { font-size: 9px; color: var(--muted); white-space: nowrap; }
.trend-bar { display: flex; align-items: flex-end; justify-content: center; height: 120px; width: 100%; }
.trend-bar i { display: block; width: min(34px, 60%); background: var(--muted); border-radius: 4px 4px 0 0; min-height: 0; transition: height .25s ease; }
.trend-col.active .trend-bar i { background: var(--acid); box-shadow: inset 0 0 0 1px var(--ink); }
.trend-col.active .trend-label { color: var(--text); font-weight: 700; }.trend-label { font-size: 9px; color: var(--muted); }
.cat-list { border-top: 1px solid var(--ink); }
.cat-row { display: grid; grid-template-columns: minmax(90px, 150px) 1fr auto; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
.cat-row b { font-size: 12px; white-space: nowrap; }
.cat-bar { display: block; height: 6px; background: var(--line); border-radius: 4px; overflow: hidden; }
.cat-bar i { display: block; height: 100%; background: var(--muted); border-radius: 4px; }
.empty-note { color: var(--muted); font-size: 12px; padding: 14px 0; }
.account-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }.account-grid article { border: 1px solid var(--line); background: var(--surface, rgba(255,255,255,.55)); border-radius: 15px; padding: 18px 20px; }.account-grid .mono { font-size: 9px; color: var(--muted); }.account-grid strong { display: block; font-size: 22px; margin-top: 8px; }.auth-card .mono { color: var(--muted); font-size: 9px; }.auth-card h2 { margin: 7px 0; font-size: 28px; }.auth-card p { color: var(--muted); font-size: 12px; line-height: 1.6; }
.reveal { animation: rise .55s both; }.reveal--2 { animation-delay: .08s; }.reveal--3 { animation-delay: .14s; }.reveal--4 { animation-delay: .2s; }@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@media (max-width: 1000px) { .workspace { grid-template-columns: 76px 1fr; }.rail { padding-inline: 10px; }.rail-link { grid-template-columns: 1fr; place-items: center; }.rail-link span, .rail-link b, .rail-note { display: none; }.new-bill .q-btn__content span { display: none; }.cards-grid { grid-template-columns: repeat(2,1fr); }.bill-row { grid-template-columns: 55px 1fr 130px 20px; }.bill-method { display: none; } }
@media (max-width: 720px) { .sync-pill { display: none; }.topbar__inner { padding: 0 15px; }.workspace { display: block; }.rail { position: fixed; z-index: 20; top: auto; bottom: 0; height: 66px; width: 100%; border: 0; border-top: 1px solid var(--line); background: rgba(244,241,232,.95); backdrop-filter: blur(12px); padding: 6px 8px; }.rail nav { display: grid; grid-template-columns: repeat(5,1fr); }.rail-link { padding: 8px 4px; display: flex; flex-direction: column; gap: 2px; font-size: 9px; }.rail-link span { display: block; }.rail-link b, .new-bill { display: none; }.rail-link.active { color: var(--ink); background: var(--acid); }.content { padding: 28px 16px 100px; }.today { display: none; }.page-heading h1 { font-size: 44px; }.hero-grid, .message-preview { grid-template-columns: 1fr; }.fund-card > strong { font-size: 45px; }.bill-row { grid-template-columns: 48px 1fr auto; gap: 10px; }.bill-value .status, .row-arrow { display: none; }.bill-title span, .bill-main small { display: none; }.message-preview { padding: 24px 18px; gap: 35px; }.phone-card { width: 100%; }.cards-grid, .source-grid { grid-template-columns: 1fr; }.filters { grid-template-columns: 1fr; }.sub-heading { display: block; }.sub-heading .q-btn { margin-top: 20px; }.form-grid { grid-template-columns: 1fr; }.span-2 { grid-column: auto; }.editor-card { border-radius: 0 !important; }.editor-body { padding: 20px 16px; } }
</style>

<style>
/* Mobile-first application shell. Larger layouts are progressive enhancements. */
.mobile-first-app {
  --mobile-nav-height: 72px;
  background: var(--canvas);
  color: var(--text);
}

.mobile-first-app .topbar,
.mobile-first-app .topbar__inner { height: 64px; }
.mobile-first-app .topbar__inner { padding: 0 max(16px, env(safe-area-inset-left)); }
.mobile-first-app .brand-caption,
.mobile-first-app .sync-pill { display: none; }
.mobile-first-app .brand-name { font-size: 13px; }
.mobile-first-app .workspace { display: block; min-height: calc(100vh - 64px); }

.mobile-first-app .rail {
  position: fixed;
  z-index: 30;
  inset: auto 0 0;
  width: 100%;
  height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
  padding: 7px max(8px, env(safe-area-inset-right)) env(safe-area-inset-bottom) max(8px, env(safe-area-inset-left));
  border: 0;
  border-top: 1px solid var(--line);
  background: var(--canvas);
}
.mobile-first-app .rail nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.mobile-first-app .rail-link {
  min-width: 0;
  min-height: 56px;
  padding: 6px 2px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.1;
  text-align: center;
  border-radius: 12px;
}
.mobile-first-app .rail-link span { display: block; white-space: nowrap; }
.mobile-first-app .rail-link b,
.mobile-first-app .rail-note,
.mobile-first-app .new-bill { display: none; }
.mobile-first-app .rail-link.active { color: var(--ink); background: var(--acid); }
.mobile-first-app .rail-link:active { transform: scale(.97); }

.mobile-first-app .mobile-fab {
  display: grid;
  position: fixed;
  z-index: 31;
  right: max(16px, env(safe-area-inset-right));
  bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom) + 14px);
  width: 54px;
  height: 54px;
  color: var(--ink);
  background: var(--acid);
  box-shadow: 0 5px 8px rgba(23, 37, 31, .22);
}

.mobile-first-app .content {
  min-width: 0;
  padding: 24px 16px calc(var(--mobile-nav-height) + 58px + env(safe-area-inset-bottom));
}
.mobile-first-app .page-heading,
.mobile-first-app .sub-heading { display: block; margin-bottom: 24px; }
.mobile-first-app .eyebrow { font-size: 10px; letter-spacing: .06em; }
.mobile-first-app .page-heading h1,
.mobile-first-app .sub-heading h1 {
  margin-top: 8px;
  font-family: 'Manrope', sans-serif;
  font-size: 2.25rem;
  line-height: 1.04;
  letter-spacing: -.035em;
  text-wrap: balance;
}
.mobile-first-app .page-heading h1 em { font-family: inherit; font-weight: 500; color: var(--muted); }
.mobile-first-app .today { display: none; }
.mobile-first-app .sub-heading .q-btn { width: 100%; min-height: 48px; margin-top: 16px; border-radius: 12px; }

.mobile-first-app .hero-grid,
.mobile-first-app .message-preview,
.mobile-first-app .cards-grid,
.mobile-first-app .source-grid,
.mobile-first-app .report-tiles,
.mobile-first-app .filters { display: grid; grid-template-columns: 1fr; gap: 14px; }
.mobile-first-app .trend-value { display: none; }
.mobile-first-app .trend-col.active .trend-value { display: block; }
@media (min-width: 640px) { .mobile-first-app .report-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } .mobile-first-app .trend-value { display: block; } }
.mobile-first-app .fund-card,
.mobile-first-app .action-card,
.mobile-first-app .message-preview { min-height: auto; padding: 22px 20px; border-radius: 16px; }
.mobile-first-app .fund-card > strong { margin-top: 18px; font-size: 2.65rem; letter-spacing: -.035em; }
.mobile-first-app .fund-card > p,
.mobile-first-app .action-card p,
.mobile-first-app .message-copy p { font-size: 13px; line-height: 1.55; }
.mobile-first-app .fund-meta { gap: 16px; font-size: 10px; }
.mobile-first-app .action-card h2 { margin: 54px 0 10px; font-size: 1.5rem; }
.mobile-first-app .action-card button { min-height: 44px; }

.mobile-first-app .section-block { margin-top: 36px; }
.mobile-first-app .section-title { margin-bottom: 10px; }
.mobile-first-app .section-title h2 { font-size: 1.45rem; }
.mobile-first-app .section-title button { min-width: 74px; min-height: 44px; }
.mobile-first-app .bill-row {
  min-height: 80px;
  padding: 12px 0;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 11px;
}
.mobile-first-app .bill-row:active { background: rgba(23, 37, 31, .05); }
.mobile-first-app .date-tile { padding: 8px 4px; }
.mobile-first-app .bill-main { min-width: 0; }
.mobile-first-app .bill-title { display: block; }
.mobile-first-app .bill-title strong { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mobile-first-app .bill-title span,
.mobile-first-app .bill-method,
.mobile-first-app .bill-value .status,
.mobile-first-app .row-arrow,
.mobile-first-app .row-pay { display: none; }
.mobile-first-app .bill-main small { display: block; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.mobile-first-app .bill-value strong { font-size: 14px; white-space: nowrap; }

.mobile-first-app .message-preview { margin-top: 42px; gap: 28px; }
.mobile-first-app .phone-card { width: 100%; max-width: none; padding: 15px; border-width: 5px; border-radius: 16px; transform: none; box-shadow: 6px 6px 0 rgba(23,37,31,.16); }
.mobile-first-app .chat-bubble { margin-left: 14px; font-size: 12px; }
.mobile-first-app .chat-actions button { min-height: 44px; font-size: 11px; }
.mobile-first-app .message-copy h2 { margin: 8px 0 12px; font-family: 'Manrope', sans-serif; font-size: 2rem; line-height: 1.05; font-weight: 700; }

.mobile-first-app .filters { margin-bottom: 18px; }
.mobile-first-app .filters .q-field__control { min-height: 48px; }
.mobile-first-app .compact-card { min-height: auto; padding: 16px; border-radius: 14px; box-shadow: none; }
.mobile-first-app .compact-card h3 { margin-top: 18px; }
.mobile-first-app .compact-card__footer { margin-top: 16px; }
.mobile-first-app .source-card { padding: 18px; border-radius: 14px; grid-template-columns: 44px minmax(0, 1fr); }
.mobile-first-app .source-list div { display: grid; gap: 3px; min-height: 52px; }
.mobile-first-app .source-list small { text-align: left; overflow-wrap: anywhere; }
.mobile-first-app .timeline article { grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; padding: 18px 0; }
.mobile-first-app .timeline p { font-size: 12px; line-height: 1.5; }

.mobile-first-app .editor-card {
  width: 100vw;
  max-height: 92dvh;
  border-radius: 16px 16px 0 0 !important;
}
.mobile-first-app .editor-head { padding: 20px 16px 16px; }
.mobile-first-app .editor-head h2 { font-size: 1.35rem; }
.mobile-first-app .editor-body { padding: 20px 16px; }
.mobile-first-app .form-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.mobile-first-app .span-2 { grid-column: auto; }
.mobile-first-app .editor-actions { padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
.mobile-first-app .editor-actions .q-btn { min-height: 48px; }

@media (min-width: 640px) {
  .mobile-first-app .content { padding-inline: 28px; }
  .mobile-first-app .page-heading h1,
  .mobile-first-app .sub-heading h1 { font-size: 2.75rem; }
  .mobile-first-app .cards-grid,
  .mobile-first-app .source-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mobile-first-app .filters { grid-template-columns: minmax(0, 1fr) 220px; }
  .mobile-first-app .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mobile-first-app .span-2 { grid-column: 1 / -1; }
}

@media (min-width: 768px) {
  .mobile-first-app .brand-caption,
  .mobile-first-app .sync-pill { display: flex; }
  .mobile-first-app .hero-grid { grid-template-columns: 1.35fr .85fr; gap: 18px; }
  .mobile-first-app .message-preview { grid-template-columns: minmax(280px, .8fr) 1fr; align-items: center; }
  .mobile-first-app .phone-card { max-width: 360px; }
  .mobile-first-app .editor-card { width: min(680px, 100vw); max-height: none; border-radius: 16px 0 0 16px !important; }
}

@media (min-width: 1024px) {
  .mobile-first-app .topbar,
  .mobile-first-app .topbar__inner { height: 74px; }
  .mobile-first-app .workspace { display: grid; grid-template-columns: 230px minmax(0, 1fr); min-height: calc(100vh - 74px); }
  .mobile-first-app .rail {
    position: sticky;
    inset: 74px auto auto;
    width: auto;
    height: calc(100vh - 74px);
    padding: 34px 20px 28px;
    border-top: 0;
    border-right: 1px solid var(--line);
    background: transparent;
  }
  .mobile-first-app .rail nav { display: grid; grid-template-columns: 1fr; gap: 5px; }
  .mobile-first-app .rail-link { min-height: 48px; padding: 12px; display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; text-align: left; justify-items: start; }
  .mobile-first-app .rail-link b { display: block; justify-self: end; }
  .mobile-first-app .rail-note { display: block; }
  .mobile-first-app .new-bill { display: flex; }
  .mobile-first-app .mobile-fab { display: none; }
  .mobile-first-app .content { padding: 48px clamp(32px, 5vw, 72px) 80px; }
  .mobile-first-app .page-heading,
  .mobile-first-app .sub-heading { display: flex; }
  .mobile-first-app .page-heading h1 { font-size: 4rem; }
  .mobile-first-app .sub-heading h1 { font-size: 3rem; }
  .mobile-first-app .today { display: block; border-left-width: 1px; }
  .mobile-first-app .sub-heading .q-btn { width: auto; margin-top: 0; }
  .mobile-first-app .fund-card > strong { font-size: 4rem; }
  .mobile-first-app .bill-row { grid-template-columns: 58px minmax(220px,1fr) 130px 145px 20px; gap: 18px; }
  .mobile-first-app .bill-title { display: flex; }
  .mobile-first-app .bill-title span,
  .mobile-first-app .bill-method,
  .mobile-first-app .bill-value .status,
  .mobile-first-app .row-arrow { display: block; }
  .mobile-first-app .row-pay { display: inline-flex; }
  .mobile-first-app .cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (hover: hover) and (pointer: fine) {
  .mobile-first-app .bill-row:hover { background: rgba(23,37,31,.05); padding-left: 8px; }
  .mobile-first-app .compact-card:hover { transform: translateY(-2px); box-shadow: 0 5px 8px rgba(23,37,31,.1); }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-first-app *,
  .mobile-first-app *::before,
  .mobile-first-app *::after { animation-duration: .01ms !important; animation-delay: 0ms !important; transition-duration: .01ms !important; }
}

/* Theme layer: restrained brand color, semantic surfaces, and accessible contrast. */
.mobile-first-app .theme-toggle { min-width: 44px; min-height: 44px; color: var(--deep-text); }
.mobile-first-app .rail-link:hover,
.mobile-first-app .bill-row:hover,
.mobile-first-app .bill-row:active { background: var(--interaction); }
.mobile-first-app .date-tile,
.mobile-first-app .compact-card,
.mobile-first-app .source-card,
.mobile-first-app .auth-card { background: var(--surface); color: var(--text); }
.mobile-first-app .editor-body,
.mobile-first-app .editor-actions { background: var(--surface); color: var(--text); }
.mobile-first-app .section-title button,
.mobile-first-app .rail-note button { color: var(--text); }
.mobile-first-app .timeline__dot { border-color: var(--text); }

.body--dark .mobile-first-app .topbar,
.body--dark .mobile-first-app .editor-head,
.body--dark .mobile-first-app .fund-card { background: oklch(11% 0.018 157); color: var(--deep-text); }
.body--dark .mobile-first-app .brand-caption,
.body--dark .mobile-first-app .fund-card__top,
.body--dark .mobile-first-app .fund-card > p,
.body--dark .mobile-first-app .fund-meta { color: oklch(76% 0.012 157); }
.body--dark .mobile-first-app .rail-link.active { background: var(--acid); color: var(--ink); }
.body--dark .mobile-first-app .action-card { background: var(--peach); color: oklch(18% 0.026 55); }
.body--dark .mobile-first-app .action-card::after { border-color: oklch(28% 0.035 55); box-shadow: none; }
.body--dark .mobile-first-app .message-preview { background: var(--surface-raised); }
.body--dark .mobile-first-app .phone-card { background: oklch(16% 0.018 157); border-color: oklch(8% 0.012 157); box-shadow: none; }
.body--dark .mobile-first-app .chat-bubble { background: oklch(27% 0.055 145); color: oklch(94% 0.012 145); }
.body--dark .mobile-first-app .chat-actions button { border-color: oklch(62% 0.09 145); color: oklch(94% 0.012 145); }
.body--dark .mobile-first-app .status { background: oklch(30% 0.015 157); color: oklch(91% 0.01 157); }
.body--dark .mobile-first-app .status--document_found { background: oklch(32% 0.07 135); }
.body--dark .mobile-first-app .status--scheduled { background: oklch(35% 0.055 230); }
.body--dark .mobile-first-app .status--paid { background: var(--acid); color: var(--ink); }
.body--dark .mobile-first-app .status--waiting_document { background: oklch(38% 0.085 52); }
.body--dark .mobile-first-app .q-field--outlined .q-field__control::before { border-color: var(--line); }
.body--dark .mobile-first-app .q-field__label,
.body--dark .mobile-first-app .q-field__native,
.body--dark .mobile-first-app .q-field__input,
.body--dark .mobile-first-app .q-field__prepend,
.body--dark .mobile-first-app .q-field__append { color: var(--text); }

@media (prefers-reduced-motion: reduce) {
  body,
  .q-layout,
  .q-card,
  .q-field__control { transition: none; }
}
</style>
