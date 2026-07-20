import { createClient } from 'jsr:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1'

// ---------- Parser de boleto (portado de src/utils/boleto.js) ----------
const OLD_BASE = Date.UTC(1997, 9, 7)
const NEW_BASE = Date.UTC(2025, 1, 22)
const DAY = 86400000
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function mod10(digits: string) {
  let sum = 0, weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let part = Number(digits[i]) * weight
    if (part > 9) part = Math.floor(part / 10) + (part % 10)
    sum += part
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function dueDateFromFactor(factor: number) {
  if (!factor) return null
  const candidates = [OLD_BASE + factor * DAY, NEW_BASE + (factor - 1000) * DAY]
  const now = Date.now()
  const plausible = candidates.filter((ms) => ms > now - 366 * DAY && ms < now + 3 * 366 * DAY)
  if (plausible.length) return toIso(plausible.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0])
  return toIso(candidates[0])
}

function parseBoleto(input: string) {
  const digits = String(input || '').replace(/\D/g, '')
  if (digits.length === 47) {
    const fields = [digits.slice(0, 10), digits.slice(10, 21), digits.slice(21, 32)]
    for (const field of fields) {
      if (mod10(field.slice(0, -1)) !== Number(field.slice(-1))) return null
    }
    const factor = Number(digits.slice(33, 37))
    const cents = Number(digits.slice(37))
    return { kind: 'bancario', amount: cents > 0 ? cents / 100 : null, dueDate: factor > 0 ? dueDateFromFactor(factor) : null }
  }
  if (digits.length === 48 && digits[0] === '8') {
    const blocks = [digits.slice(0, 12), digits.slice(12, 24), digits.slice(24, 36), digits.slice(36, 48)]
    const barcode = blocks.map((b) => b.slice(0, 11)).join('')
    const indicator = barcode[2]
    if (['6', '7', '8', '9'].includes(indicator)) {
      const cents = Number(barcode.slice(4, 15))
      const effective = indicator === '6' || indicator === '8'
      return { kind: 'arrecadacao', amount: effective && cents > 0 ? cents / 100 : null, dueDate: null }
    }
    return { kind: 'arrecadacao', amount: null, dueDate: null }
  }
  return null
}

// ---------- Extração de candidatos e datas de um texto ----------
function candidateLines(text: string): string[] {
  const out = new Set<string>()
  const spaced = text.match(/\d[\d.\s]{40,72}\d/g) || []
  for (const m of spaced) {
    const d = m.replace(/\D/g, '')
    if (d.length === 47 || d.length === 48) out.add(d)
  }
  const contiguous = text.match(/\d{47,48}/g) || []
  for (const d of contiguous) if (d.length === 47 || d.length === 48) out.add(d)
  return [...out]
}

function dueDateFromText(text: string): string | null {
  const m = text.match(/vencimento[:\s]*([0-3]?\d)[/.]([01]?\d)[/.](\d{4})/i)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// ---------- Helpers Gmail ----------
const b64urlToBytes = (data: string) => {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
const bytesToText = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

async function googleAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`google token: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token as string
}

async function gmail(path: string, token: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`gmail ${path}: ${res.status}`)
  return res.json()
}

function walkParts(part: any, acc: { bodies: string[]; pdfs: { attachmentId: string }[] }) {
  if (!part) return
  const mime = part.mimeType || ''
  if ((mime === 'text/plain' || mime === 'text/html') && part.body?.data) {
    acc.bodies.push(bytesToText(b64urlToBytes(part.body.data)))
  }
  if (mime === 'application/pdf' && part.body?.attachmentId) {
    acc.pdfs.push({ attachmentId: part.body.attachmentId })
  }
  for (const p of part.parts || []) walkParts(p, acc)
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : text
  } catch {
    return ''
  }
}

// Extrai todos os boletos de uma mensagem Gmail (corpo + PDFs).
async function boletosFromMessage(messageId: string, token: string) {
  const msg = await gmail(`messages/${messageId}?format=full`, token)
  const acc = { bodies: [] as string[], pdfs: [] as { attachmentId: string }[] }
  walkParts(msg.payload, acc)

  const found: { amount: number | null; dueDate: string | null; raw: string }[] = []
  const consume = (text: string) => {
    const textDue = dueDateFromText(text)
    for (const raw of candidateLines(text)) {
      const parsed = parseBoleto(raw)
      if (parsed) found.push({ amount: parsed.amount, dueDate: parsed.dueDate || textDue, raw })
    }
  }

  for (const body of acc.bodies) consume(body)
  for (const pdf of acc.pdfs) {
    const att = await gmail(`messages/${messageId}/attachments/${pdf.attachmentId}`, token)
    if (att.data) consume(await pdfText(b64urlToBytes(att.data)))
  }
  // dedupe por linha digitável
  const seen = new Set<string>()
  return found.filter((b) => (seen.has(b.raw) ? false : (seen.add(b.raw), true)))
}

// ---------- Sincronização por usuário ----------
async function syncUser(supabase: any, userId: string, clientId: string, clientSecret: string) {
  const { data: integ } = await supabase.from('user_integrations').select('google_refresh_token').eq('user_id', userId).maybeSingle()
  if (!integ?.google_refresh_token) return { userId, error: 'sem_gmail_conectado' }

  const token = await googleAccessToken(integ.google_refresh_token, clientId, clientSecret)
  const { data: templates } = await supabase.from('recurring_templates').select('*').eq('user_id', userId).eq('active', true)

  let updated = 0
  const details: string[] = []

  for (const tpl of templates || []) {
    if (!tpl.sender) continue
    const q = encodeURIComponent(`from:${tpl.sender} has:attachment newer_than:120d`)
    const list = await gmail(`messages?q=${q}&maxResults=15`, token)
    for (const m of list.messages || []) {
      const boletos = await boletosFromMessage(m.id, token)
      for (const b of boletos) {
        if (!b.dueDate) continue // sem período não dá pra casar a ocorrência
        const period = b.dueDate.slice(0, 7)
        const row = {
          user_id: userId, template_id: tpl.id, period,
          title: tpl.title, category: tpl.category,
          amount: b.amount, nominal_amount: b.amount,
          due_date: b.dueDate, payer_name: tpl.payer_name,
          source_channel: tpl.source_channel, sender: tpl.sender,
          locator_hint: tpl.locator_hint, payment_method: tpl.payment_method,
          bank_account: tpl.bank_account, status: 'document_found',
          barcode: b.raw, recurring: true,
        }
        // não sobrescreve ocorrência que já tem código de barras
        const { data: existing } = await supabase.from('bills')
          .select('id, barcode').eq('template_id', tpl.id).eq('period', period).maybeSingle()
        if (existing?.barcode) continue
        if (existing) {
          await supabase.from('bills').update({ amount: row.amount, nominal_amount: row.nominal_amount, due_date: row.due_date, barcode: row.barcode, status: 'document_found' }).eq('id', existing.id)
        } else {
          await supabase.from('bills').insert(row)
        }
        updated++
        details.push(`${tpl.title} ${period}: ${b.amount ?? '—'}`)
      }
    }
  }

  await supabase.from('user_integrations').update({ last_sync_at: new Date().toISOString() }).eq('user_id', userId)
  return { userId, updated, details }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return new Response(JSON.stringify({ error: 'missing_google_secrets' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(supabaseUrl, serviceKey)

  // Descobre o alvo: se veio um JWT de usuário, sincroniza só ele; senão (cron), todos.
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
  let targetUserId: string | null = null
  if (authHeader && authHeader !== serviceKey) {
    const { data } = await admin.auth.getUser(authHeader)
    targetUserId = data?.user?.id || null
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    if (targetUserId) {
      return json(await syncUser(admin, targetUserId, clientId, clientSecret))
    }
    const { data: rows } = await admin.from('user_integrations').select('user_id')
    const results = []
    for (const r of rows || []) results.push(await syncUser(admin, r.user_id, clientId, clientSecret))
    return json({ results })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
