create table if not exists public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  category text not null default 'Outros',
  frequency text not null default 'monthly' check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')),
  due_day smallint not null check (due_day between 1 and 31),
  anchor_month text not null check (anchor_month ~ '^\d{4}-\d{2}$'),
  nominal_amount numeric(12,2) check (nominal_amount >= 0),
  payer_name text,
  source_channel text not null default 'Gmail' check (source_channel in ('Gmail', 'WhatsApp', 'DDA Nubank', 'Portal', 'Aplicativo', 'Outro')),
  sender text,
  locator_hint text,
  payment_method text not null default 'Boleto' check (payment_method in ('Boleto', 'Débito automático', 'Pix')),
  bank_account text not null default 'Nubank' check (bank_account in ('Nubank', 'CAIXA')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_templates_user_idx on public.recurring_templates (user_id);
alter table public.recurring_templates enable row level security;
grant select, insert, update, delete on table public.recurring_templates to authenticated;

create policy "templates_select_own" on public.recurring_templates for select to authenticated using ((select auth.uid()) = user_id);
create policy "templates_insert_own" on public.recurring_templates for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "templates_update_own" on public.recurring_templates for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "templates_delete_own" on public.recurring_templates for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists recurring_templates_set_updated_at on public.recurring_templates;
create trigger recurring_templates_set_updated_at before update on public.recurring_templates
for each row execute function public.set_updated_at();

alter table public.bills add column if not exists template_id uuid references public.recurring_templates(id) on delete set null;
alter table public.bills add column if not exists period text check (period is null or period ~ '^\d{4}-\d{2}$');
alter table public.bills alter column amount drop not null;

create unique index if not exists bills_template_period_uidx
  on public.bills (template_id, period)
  where template_id is not null and period is not null;
