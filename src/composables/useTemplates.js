import { computed, ref } from 'vue'
import { LocalStorage } from 'quasar'

const storageKey = 'provisiona:templates:v1'
const templates = ref(LocalStorage.getItem(storageKey) || [])
const syncMode = ref('local')

const persist = () => LocalStorage.set(storageKey, templates.value)

export const FREQUENCY_STEPS = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 }
export const FREQUENCY_LABELS = { monthly: 'Mensal', bimonthly: 'Bimestral', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }

export function useTemplates() {
  const { $supabase: supabase } = useNuxtApp()
  const activeTemplates = computed(() => templates.value.filter((tpl) => tpl.active))

  async function loadTemplates() {
    const { data, error } = await supabase.from('recurring_templates').select('*').order('title')
    if (error) throw error
    templates.value = data.map(fromRow)
    syncMode.value = 'supabase'
    persist()
  }

  async function saveTemplate(template) {
    const normalized = { ...template, id: template.id || crypto.randomUUID() }
    const index = templates.value.findIndex((item) => item.id === normalized.id)
    if (index >= 0) templates.value[index] = normalized
    else templates.value.push(normalized)
    persist()
    if (syncMode.value === 'supabase') {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('recurring_templates').upsert(toRow(normalized, user.id))
      if (error) throw error
    }
    return normalized
  }

  async function removeTemplate(id) {
    templates.value = templates.value.filter((item) => item.id !== id)
    persist()
    if (syncMode.value === 'supabase') {
      const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
      if (error) throw error
    }
  }

  async function pushLocalTemplates() {
    const { data: { user } } = await supabase.auth.getUser()
    const rows = templates.value.map((tpl) => toRow(tpl, user.id))
    if (rows.length) {
      const { error } = await supabase.from('recurring_templates').upsert(rows)
      if (error) throw error
    }
    syncMode.value = 'supabase'
    await loadTemplates()
  }

  function goLocalTemplates() {
    syncMode.value = 'local'
  }

  return { templates, activeTemplates, loadTemplates, saveTemplate, removeTemplate, pushLocalTemplates, goLocalTemplates }
}

const toRow = (tpl, userId) => ({
  id: tpl.id, user_id: userId, title: tpl.title, category: tpl.category,
  frequency: tpl.frequency, due_day: tpl.dueDay, anchor_month: tpl.anchorMonth,
  nominal_amount: tpl.nominalAmount === null || tpl.nominalAmount === '' ? null : tpl.nominalAmount,
  payer_name: tpl.payerName, source_channel: tpl.sourceChannel, sender: tpl.sender,
  locator_hint: tpl.locatorHint, payment_method: tpl.paymentMethod, bank_account: tpl.bankAccount,
  active: Boolean(tpl.active),
})

const fromRow = (row) => ({
  id: row.id, title: row.title, category: row.category,
  frequency: row.frequency, dueDay: Number(row.due_day), anchorMonth: row.anchor_month,
  nominalAmount: row.nominal_amount === null ? null : Number(row.nominal_amount),
  payerName: row.payer_name, sourceChannel: row.source_channel, sender: row.sender,
  locatorHint: row.locator_hint, paymentMethod: row.payment_method, bankAccount: row.bank_account,
  active: row.active,
})
