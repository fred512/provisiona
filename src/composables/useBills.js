import { computed, ref } from 'vue'
import { LocalStorage } from 'quasar'
import { demoBills } from '../data/demoBills'

const storageKey = 'provisiona:bills:v1'
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

  async function updateStatus(id, status) {
    const bill = bills.value.find((item) => item.id === id)
    if (!bill) return
    await save({ ...bill, status })
  }

  function resetDemo() {
    bills.value = structuredClone(demoBills)
    syncMode.value = 'local'
    persist()
  }

  return { bills, sortedBills, loading, syncMode, nubankNeed, waitingDocuments, scheduled, load, save, updateStatus, resetDemo }
}

const toRow = (bill, userId) => ({
  id: bill.id, user_id: userId, title: bill.title, category: bill.category,
  amount: bill.amount, nominal_amount: bill.nominalAmount, due_date: bill.dueDate,
  document_expected_at: bill.documentExpectedAt || null, discount_until: bill.discountUntil || null,
  payer_name: bill.payerName, source_channel: bill.sourceChannel, sender: bill.sender,
  locator_hint: bill.locatorHint, payment_method: bill.paymentMethod, bank_account: bill.bankAccount,
  status: bill.status, barcode: bill.barcode || null, recurring: Boolean(bill.recurring),
})

const fromRow = (row) => ({
  id: row.id, title: row.title, category: row.category, amount: Number(row.amount),
  nominalAmount: Number(row.nominal_amount || row.amount), dueDate: row.due_date,
  documentExpectedAt: row.document_expected_at, discountUntil: row.discount_until,
  payerName: row.payer_name, sourceChannel: row.source_channel, sender: row.sender,
  locatorHint: row.locator_hint, paymentMethod: row.payment_method, bankAccount: row.bank_account,
  status: row.status, barcode: row.barcode || '', recurring: row.recurring,
})
