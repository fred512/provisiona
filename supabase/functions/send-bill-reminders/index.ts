import { createClient } from 'jsr:@supabase/supabase-js@2'

const TIMEZONE_OFFSET_HOURS = -3 // America/Sao_Paulo, sem horário de verão desde 2019

const EVENT_STAGES = [
  { offsetDays: 7, eventType: 'document_search', label: 'Faltam 7 dias — vale procurar o documento' },
  { offsetDays: 1, eventType: 'funding_required', label: 'Vence amanhã — provisione o saldo' },
  { offsetDays: 0, eventType: 'due_today', label: 'Vence hoje' },
  { offsetDays: -1, eventType: 'payment_confirmation', label: 'Venceu ontem e ainda está pendente' },
]

function todayIsoInSaoPaulo() {
  const now = new Date(Date.now() + TIMEZONE_OFFSET_HOURS * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function money(value) {
  if (value === null || value === undefined || value === '') return 'a definir'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return new Response(JSON.stringify({ error: 'missing_env' }), { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Disparo de teste: { test: true, user_id } → envia um e-mail de amostra agora.
  let payload: any = {}
  try { payload = await req.json() } catch { /* sem corpo */ }
  if (payload?.test && payload?.user_id) {
    const { data: userData } = await supabase.auth.admin.getUserById(payload.user_id)
    const email = userData?.user?.email
    if (!email) return new Response(JSON.stringify({ error: 'sem_email' }), { status: 400 })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Provisiona <onboarding@resend.dev>',
        to: [email],
        subject: 'Provisiona — teste de lembrete',
        html: '<div style="font-family:sans-serif;max-width:520px;margin:auto;"><h2 style="color:#17251f;">Teste de lembrete ✅</h2><p>Se você recebeu este e-mail, os lembretes de vencimento estão funcionando. Você será avisado em D−7, D−1, no dia e D+1 de cada boleto em aberto.</p></div>',
      }),
    })
    return new Response(JSON.stringify({ sent: res.ok, to: email, status: res.status }), { status: res.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } })
  }

  const today = todayIsoInSaoPaulo()

  const targets = EVENT_STAGES.map((stage) => ({ ...stage, dueDate: addDaysIso(today, stage.offsetDays) }))
  const dueDates = targets.map((t) => t.dueDate)

  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('id, user_id, title, amount, due_date, sender, locator_hint, source_channel, status')
    .in('due_date', dueDates)
    .neq('status', 'paid')

  if (billsError) return new Response(JSON.stringify({ error: billsError.message }), { status: 500 })
  if (!bills.length) return new Response(JSON.stringify({ sent: 0, reason: 'no_bills_due' }), { status: 200 })

  const { data: existingEvents, error: eventsError } = await supabase
    .from('reminder_events')
    .select('bill_id, event_type')
    .eq('channel', 'email')
    .in('bill_id', bills.map((b) => b.id))

  if (eventsError) return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 })
  const alreadySent = new Set(existingEvents.map((e) => `${e.bill_id}:${e.event_type}`))

  const pendingByUser = new Map()
  for (const bill of bills) {
    const stage = targets.find((t) => t.dueDate === bill.due_date)
    if (!stage) continue
    if (alreadySent.has(`${bill.id}:${stage.eventType}`)) continue
    const list = pendingByUser.get(bill.user_id) || []
    list.push({ bill, stage })
    pendingByUser.set(bill.user_id, list)
  }

  let sentCount = 0
  const eventsToInsert = []

  for (const [userId, items] of pendingByUser) {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userData?.user?.email) continue

    const rows = items.map(({ bill, stage }) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e2d9;">
          <strong>${bill.title}</strong><br>
          <span style="color:#65706b;font-size:13px;">${stage.label} · vence ${formatDate(bill.due_date)}</span><br>
          <span style="color:#65706b;font-size:13px;">${money(bill.amount)} · ${bill.source_channel}${bill.sender ? ' · ' + bill.sender : ''}${bill.locator_hint ? ' · ' + bill.locator_hint : ''}</span>
        </td>
      </tr>`).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;">
        <h2 style="color:#17251f;">Provisiona — lembretes de hoje</h2>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <p style="color:#65706b;font-size:12px;margin-top:20px;">Abra o app para marcar como paga ou colar a linha digitável.</p>
      </div>`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Provisiona <onboarding@resend.dev>',
        to: [userData.user.email],
        subject: `Provisiona — ${items.length} lembrete${items.length > 1 ? 's' : ''} de vencimento`,
        html,
      }),
    })

    if (!resendResponse.ok) continue

    sentCount += items.length
    const now = new Date().toISOString()
    for (const { bill, stage } of items) {
      eventsToInsert.push({
        user_id: userId, bill_id: bill.id, channel: 'email', event_type: stage.eventType,
        scheduled_for: now, delivered_at: now, status: 'sent',
      })
    }
  }

  if (eventsToInsert.length) {
    const { error: insertError } = await supabase.from('reminder_events').insert(eventsToInsert)
    if (insertError) return new Response(JSON.stringify({ sent: sentCount, insertError: insertError.message }), { status: 207 })
  }

  return new Response(JSON.stringify({ sent: sentCount }), { status: 200 })
})
