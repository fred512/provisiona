create extension if not exists pgcrypto;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  category text not null default 'Outros',
  amount numeric(12,2) not null check (amount >= 0),
  nominal_amount numeric(12,2) check (nominal_amount >= 0),
  due_date date not null,
  document_expected_at date,
  discount_until date,
  payer_name text,
  source_channel text not null check (source_channel in ('Gmail', 'WhatsApp', 'DDA Nubank', 'Portal', 'Aplicativo', 'Outro')),
  sender text,
  locator_hint text,
  payment_method text not null check (payment_method in ('Boleto', 'Débito automático', 'Pix')),
  bank_account text not null check (bank_account in ('Nubank', 'CAIXA')),
  status text not null default 'waiting_document' check (status in ('waiting_document', 'document_found', 'scheduled', 'paid')),
  barcode text,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_user_due_date_idx on public.bills (user_id, due_date);
create index if not exists bills_user_status_idx on public.bills (user_id, status);

alter table public.bills enable row level security;
grant select, insert, update, delete on table public.bills to authenticated;

create policy "bills_select_own"
on public.bills for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "bills_insert_own"
on public.bills for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "bills_update_own"
on public.bills for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "bills_delete_own"
on public.bills for delete
to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.reminder_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'push', 'email')),
  event_type text not null check (event_type in ('document_search', 'funding_required', 'due_today', 'payment_confirmation')),
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists reminder_events_user_schedule_idx on public.reminder_events (user_id, scheduled_for);
alter table public.reminder_events enable row level security;
grant select, insert, update, delete on table public.reminder_events to authenticated;

create policy "reminders_select_own" on public.reminder_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "reminders_insert_own" on public.reminder_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reminders_update_own" on public.reminder_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reminders_delete_own" on public.reminder_events for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at before update on public.bills
for each row execute function public.set_updated_at();
