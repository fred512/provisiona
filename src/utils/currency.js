export function parseCurrencyInput(text) {
  if (text === null || text === undefined || text === '') return null
  const cleaned = String(text).trim().replace(/[^\d.,-]/g, '')
  if (!cleaned) return null
  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')
  let normalized = cleaned
  if (hasComma && hasDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (hasComma) normalized = cleaned.replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatCurrencyInput(value) {
  if (value === null || value === undefined || value === '') return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))
}
