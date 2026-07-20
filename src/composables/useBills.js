import { computed, ref } from 'vue'
import { LocalStorage } from 'quasar'
import { demoBills } from '../data/demoBills'
import { dueDateForPeriod } from '../utils/dates'
import { FREQUENCY_STEPS } from './useTemplates'

const storageKey = 'provisiona:bills:v1'
const isDemoId = (id) => String(id).startsWith('demo-')
const bills = ref(LocalStorage.getItem(storageKey) || demoBills)
const loading = ref(false)
const syncMode = ref('local')

const persist = () => LocalStorage.set(storageKey, bills.value)

export function useBills() {
  const { $supabase: supabase, $isSupabaseConfigured: isSupabaseConfigured } = useNuxtApp()
  const sortedBills = computed(() => [...bills.value].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
  const nubankNeed = computed(() => bills.value
    .filter((bill) => bill.bankAccount === 'Nubank' && bill.status !== 'paid')
    .reduce((total, bill) => total + Number(bill.amount || 0), 0))
  const waitingDocuments = computed(() => bills.value.filter((bill) => bill.status === 'waiting_document').length)
  const scheduled = computed(() => bills.value.filter((bill) => bill.status === 'scheduled').length)

  async function load() {
    if (!isSupabaseConfigured) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    loading.value = true
    const { data, error } = await supabase.from('bills').select('*').order('due_date')
    loading.value = false
    if (error) throw error
    bills.value = data.map(fromRow)
    syncMode.value = 'supabase'
    persist()
  }

  async function save(bill) {
    const normalized = { ...bill, id: bill.id || crypto.randomUUID() }
    const index = bills.value.findIndex((item) => item.id === normalized.id)
    if (index >= 0) bills.value[index] = normalized
    else bills.value.unshift(normalized)
    persist()

    if (syncMode.value === 'supabase') {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('bills').upsert(toRow(normalized, user.id))
      if (error) throw error
    }
    return normalized
  }

  async function remove(id) {
    bills.value = bills.value.filter((item) => item.id !== id)
    persist()
    if (syncMode.value === 'supabase' && !isDemoId(id)) {
      const { error } = await supabase.from('bills').delete().eq('id', id)
      if (error) throw error
    }
  }

  async function markPaid(id) {
    const bill = bills.value.find((item) => item.id === id)
    if (!bill || bill.status === 'paid') return
    await save({ ...bill, status: 'paid' })
  }

  const occurrenceFromTemplate = (tpl, period) => ({
    id: crypto.randomUUID(), templateId: tpl.id, period,
    title: tpl.title, category: tpl.category,
    amount: tpl.nominalAmount ?? null, nominalAmount: tpl.nominalAmount ?? null,
    dueDate: dueDateForPeriod(period, tpl.dueDay),
    documentExpectedAt: '', discountUntil: '',
    payerName: tpl.payerName, sourceChannel: tpl.sourceChannel, sender: tpl.sender,
    locatorHint: tpl.locatorHint, paymentMethod: tpl.paymentMethod, bankAccount: tpl.bankAccount,
    status: 'waiting_document', barcode: '', recurring: true,
  })

  const periodOfIdx = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`

  async function materialize(activeTemplates, today = new Date()) {
    const nowIdx = today.getFullYear() * 12 + today.getMonth()
    const created = []
    for (const tpl of activeTemplates) {
      const step = FREQUENCY_STEPS[tpl.frequency] || 1
      const [ay, am] = tpl.anchorMonth.split('-').map(Number)
      const anchorIdx = ay * 12 + (am - 1)
      const targets = []
      if (anchorIdx >= nowIdx) {
        if (anchorIdx <= nowIdx + 1) targets.push(anchorIdx)
      } else {
        const diff = nowIdx - anchorIdx
        const currentIdx = anchorIdx + Math.floor(diff / step) * step
        if (currentIdx === nowIdx) targets.push(currentIdx)
        const currentDue = dueDateForPeriod(periodOfIdx(currentIdx), tpl.dueDay)
        if (new Date(`${currentDue}T23:59:59`) < today) targets.push(currentIdx + step)
      }
      for (const idx of targets) {
        const period = periodOfIdx(idx)
        if (bills.value.some((b) => b.templateId === tpl.id && b.period === period)) continue
        const bill = occurrenceFromTemplate(tpl, period)
        await save(bill)
        created.push(bill)
      }
    }
    return created
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

  function goLocal() {
    syncMode.value = 'local'
  }

  const hasRealLocalBills = computed(() => bills.value.some((bill) => !isDemoId(bill.id)))

  function resetDemo() {
    bills.value = structuredClone(demoBills)
    syncMode.value = 'local'
    persist()
  }

  return { bills, sortedBills, loading, syncMode, nubankNeed, waitingDocuments, scheduled, hasRealLocalBills, load, save, remove, markPaid, materialize, pushLocal, goLocal, resetDemo }
}

const toRow = (bill, userId) => ({
  id: bill.id, user_id: userId, title: bill.title, category: bill.category,
  template_id: bill.templateId || null, period: bill.period || null,
  amount: bill.amount === null || bill.amount === '' ? null : bill.amount,
  nominal_amount: bill.nominalAmount === null || bill.nominalAmount === '' ? null : bill.nominalAmount,
  due_date: bill.dueDate,
  document_expected_at: bill.documentExpectedAt || null, discount_until: bill.discountUntil || null,
  payer_name: bill.payerName, source_channel: bill.sourceChannel, sender: bill.sender,
  locator_hint: bill.locatorHint, payment_method: bill.paymentMethod, bank_account: bill.bankAccount,
  status: bill.status, barcode: bill.barcode || null, recurring: Boolean(bill.recurring),
})

const fromRow = (row) => ({
  id: row.id, title: row.title, category: row.category,
  templateId: row.template_id || null, period: row.period || null,
  amount: row.amount === null ? null : Number(row.amount),
  nominalAmount: row.nominal_amount === null ? (row.amount === null ? null : Number(row.amount)) : Number(row.nominal_amount),
  dueDate: row.due_date,
  documentExpectedAt: row.document_expected_at, discountUntil: row.discount_until,
  payerName: row.payer_name, sourceChannel: row.source_channel, sender: row.sender,
  locatorHint: row.locator_hint, paymentMethod: row.payment_method, bankAccount: row.bank_account,
  status: row.status, barcode: row.barcode || '', recurring: row.recurring,
})
