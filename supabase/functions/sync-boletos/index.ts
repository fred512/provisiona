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
  const runs = [...(text.match(/\d[\d.\s]{40,90}\d/g) || []), ...(text.match(/\d{44,60}/g) || [])]
  for (const m of runs) {
    const d = m.replace(/\D/g, '')
    // A extração de PDF às vezes gruda um dígito vizinho na linha digitável;
    // testamos os recortes de 47 e 48 dígitos das duas pontas (o mod10 valida).
    for (const len of [47, 48]) {
      if (d.length < len) continue
      out.add(d.slice(0, len))
      out.add(d.slice(d.length - len))
    }
  }
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
  if (!res.ok) throw new Error(`gmail ${res.status}: ${(await res.text()).slice(0, 400)}`)
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
    try { await (pdf as any).destroy?.() } catch { /* noop */ }
    return Array.isArray(text) ? text.join('\n') : text
  } catch {
    return ''
  }
}

type Boleto = { amount: number | null; dueDate: string | null; raw: string }

function normalizeText(text: string) {
  return text
    .replace(/&#47;/g, '/').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
}

function scanText(raw0: string, found: Boleto[]) {
  const text = normalizeText(raw0)
  const textDue = dueDateFromText(text)
  for (const raw of candidateLines(text)) {
    const parsed = parseBoleto(raw)
    if (parsed) found.push({ amount: parsed.amount, dueDate: parsed.dueDate || textDue, raw })
  }
}

// Extrai boletos de uma mensagem: corpo (barato) sempre; PDFs só dentro do
// orçamento e ignorando anexos já processados (evita OOM e retrabalho).
function subjectOf(payload: any): string {
  const h = (payload?.headers || []).find((x: any) => (x.name || '').toLowerCase() === 'subject')
  return h?.value || ''
}

async function boletosFromMessage(
  supabase: any, userId: string, messageId: string, token: string, budget: { pdfs: number; more: boolean },
): Promise<Boleto[]> {
  const msg = await gmail(`messages/${messageId}?format=full`, token)
  const acc = { bodies: [] as string[], pdfs: [] as { attachmentId: string }[] }
  walkParts(msg.payload, acc)

  const found: Boleto[] = []
  for (const body of acc.bodies) scanText(body, found)

  for (const pdf of acc.pdfs) {
    const { data: already } = await supabase.from('synced_attachments')
      .select('attachment_id').eq('user_id', userId).eq('message_id', messageId).eq('attachment_id', pdf.attachmentId).maybeSingle()
    if (already) continue
    if (budget.pdfs <= 0) { budget.more = true; continue }
    budget.pdfs--
    const att = await gmail(`messages/${messageId}/attachments/${pdf.attachmentId}`, token)
    if (att.data) scanText(await pdfText(b64urlToBytes(att.data)), found)
    await supabase.from('synced_attachments').insert({ user_id: userId, message_id: messageId, attachment_id: pdf.attachmentId })
  }

  const seen = new Set<string>()
  return found.filter((b) => (seen.has(b.raw) ? false : (seen.add(b.raw), true)))
}

const STOPWORDS = new Set(['CONTA', 'FATURA', 'BOLETO', 'BOLETOS', 'TAXA', 'ASSUNTO', 'CARTAO', 'MENSALIDADE', 'MANSALIDADE', 'SEU', 'SUA', 'ESTA', 'DIGITAL', 'CHEGOU', 'DO', 'DA', 'DE', 'PARA'])

// Palavra distintiva do assunto (locator_hint) para estreitar a busca no Gmail.
function subjectTerm(locatorHint: string): string {
  const text = (locatorHint || '').replace(/assunto:/gi, ' ')
  const words = text.toUpperCase().split(/[^A-Z0-9À-Ú]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  return words.sort((a, b) => b.length - a.length)[0] || ''
}

// ---------- Sincronização por usuário ----------
async function syncUser(supabase: any, userId: string, clientId: string, clientSecret: string) {
  const { data: integ } = await supabase.from('user_integrations').select('google_refresh_token').eq('user_id', userId).maybeSingle()
  if (!integ?.google_refresh_token) return { userId, error: 'sem_gmail_conectado' }

  const token = await googleAccessToken(integ.google_refresh_token, clientId, clientSecret)
  const { data: templates } = await supabase.from('recurring_templates').select('*').eq('user_id', userId).eq('active', true)

  let updated = 0
  const details: string[] = []
  const budget = { pdfs: 6, more: false }

  const senderCount: Record<string, number> = {}
  for (const tpl of templates || []) if (tpl.sender) senderCount[tpl.sender] = (senderCount[tpl.sender] || 0) + 1

  // Processa primeiro os modelos com assunto distintivo (busca estreita, barata):
  // evita que buscas amplas (extratos, faturas) gastem o orçamento antes deles.
  const ordered = [...(templates || [])].sort((a, b) => (subjectTerm(b.locator_hint) ? 1 : 0) - (subjectTerm(a.locator_hint) ? 1 : 0))

  for (const tpl of ordered) {
    if (!tpl.sender) continue
    if (budget.pdfs <= 0) { budget.more = true; break }
    // Busca por remetente + assunto distintivo (quando informado no modelo),
    // o que corta o lixo de e-mails pessoais e extratos sem boleto.
    const term = subjectTerm(tpl.locator_hint)
    // Remetente compartilhado sem assunto = ambíguo/aberto demais → ignora.
    if (!term && senderCount[tpl.sender] > 1) continue
    let q = `from:${tpl.sender} has:attachment newer_than:120d`
    if (term) q += ` subject:${term}`
    const list = await gmail(`messages?q=${encodeURIComponent(q)}&maxResults=6`, token)
    for (const m of list.messages || []) {
      if (budget.pdfs <= 0) { budget.more = true; break }
      const boletos = await boletosFromMessage(supabase, userId, m.id, token, budget)
      for (const b of boletos) {
        if (!b.dueDate) continue
        const period = b.dueDate.slice(0, 7)
        const { data: existing } = await supabase.from('bills')
          .select('id, barcode').eq('template_id', tpl.id).eq('period', period).maybeSingle()
        if (existing?.barcode) continue
        if (existing) {
          await supabase.from('bills').update({ amount: b.amount, nominal_amount: b.amount, due_date: b.dueDate, barcode: b.raw, status: 'document_found' }).eq('id', existing.id)
        } else {
          await supabase.from('bills').insert({
            user_id: userId, template_id: tpl.id, period,
            title: tpl.title, category: tpl.category,
            amount: b.amount, nominal_amount: b.amount, due_date: b.dueDate,
            payer_name: tpl.payer_name, source_channel: tpl.source_channel, sender: tpl.sender,
            locator_hint: tpl.locator_hint, payment_method: tpl.payment_method,
            bank_account: tpl.bank_account, status: 'document_found', barcode: b.raw, recurring: true,
          })
        }
        updated++
        details.push(`${tpl.title} ${period}: ${b.amount ?? '—'}`)
      }
    }
  }

  await supabase.from('user_integrations').update({ last_sync_at: new Date().toISOString() }).eq('user_id', userId)
  return { userId, updated, details, more: budget.more }
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

  // Modo diagnóstico: { debug_message_id, user_id } → devolve o que foi extraído.
  let payload: any = {}
  try { payload = await req.json() } catch { /* sem corpo */ }
  if (payload?.debug_message_id) {
    const { data: integ } = await admin.from('user_integrations').select('google_refresh_token').eq('user_id', payload.user_id).maybeSingle()
    const token = await googleAccessToken(integ.google_refresh_token, clientId, clientSecret)
    const msg = await gmail(`messages/${payload.debug_message_id}?format=full`, token)
    const acc = { bodies: [] as string[], pdfs: [] as { attachmentId: string }[] }
    walkParts(msg.payload, acc)
    const out: any = { bodyCandidates: [], pdfs: [] }
    for (const body of acc.bodies) out.bodyCandidates.push(...candidateLines(body))
    for (const pdf of acc.pdfs.slice(0, 2)) {
      const att = await gmail(`messages/${payload.debug_message_id}/attachments/${pdf.attachmentId}`, token)
      const text = att.data ? await pdfText(b64urlToBytes(att.data)) : ''
      out.pdfs.push({ len: text.length, snippet: text.slice(0, 500), candidates: candidateLines(text) })
    }
    return json(out)
  }

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
