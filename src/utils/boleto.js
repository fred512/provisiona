const OLD_BASE = Date.UTC(1997, 9, 7)
const NEW_BASE = Date.UTC(2025, 1, 22)
const DAY = 86400000

const toIso = (ms) => new Date(ms).toISOString().slice(0, 10)

function mod10(digits) {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let part = Number(digits[i]) * weight
    if (part > 9) part = Math.floor(part / 10) + (part % 10)
    sum += part
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function dueDateFromFactor(factor) {
  if (!factor) return null
  const candidates = [OLD_BASE + factor * DAY, NEW_BASE + (factor - 1000) * DAY]
  const now = Date.now()
  const plausible = candidates.filter((ms) => ms > now - 366 * DAY && ms < now + 3 * 366 * DAY)
  if (plausible.length) return toIso(plausible.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0])
  return toIso(candidates[0])
}

// Linha digitável de 47 dígitos (boleto bancário) ou 48 (arrecadação/convênio).
// Retorna { kind, amount, dueDate } ou null quando o código não é válido.
export function parseBoleto(input) {
  const digits = String(input || '').replace(/\D/g, '')

  if (digits.length === 47) {
    const fields = [digits.slice(0, 10), digits.slice(10, 21), digits.slice(21, 32)]
    for (const field of fields) {
      const body = field.slice(0, -1)
      if (mod10(body) !== Number(field.slice(-1))) return null
    }
    const factor = Number(digits.slice(33, 37))
    const cents = Number(digits.slice(37))
    return {
      kind: 'bancario',
      amount: cents > 0 ? cents / 100 : null,
      dueDate: factor > 0 ? dueDateFromFactor(factor) : null,
    }
  }

  if (digits.length === 48 && digits[0] === '8') {
    const blocks = [digits.slice(0, 12), digits.slice(12, 24), digits.slice(24, 36), digits.slice(36, 48)]
    const barcode = blocks.map((block) => block.slice(0, 11)).join('')
    const valueIndicator = barcode[2]
    if (['6', '7', '8', '9'].includes(valueIndicator)) {
      const cents = Number(barcode.slice(4, 15))
      const isEffective = valueIndicator === '6' || valueIndicator === '8'
      return {
        kind: 'arrecadacao',
        amount: isEffective && cents > 0 ? cents / 100 : null,
        dueDate: null,
      }
    }
    return { kind: 'arrecadacao', amount: null, dueDate: null }
  }

  return null
}
