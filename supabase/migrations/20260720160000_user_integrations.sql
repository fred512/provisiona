create table if not exists public.user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_refresh_token text,
  gmail_connected_at timestamptz,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_integrations enable row level security;
grant insert, update on table public.user_integrations to authenticated;

-- O cliente só grava (upsert) o próprio token; NÃO há policy de SELECT,
-- então o refresh token nunca é relido pelo navegador. A Edge Function
-- acessa via service_role, que ignora RLS.
create policy "integrations_insert_own" on public.user_integrations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "integrations_update_own" on public.user_integrations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists user_integrations_set_updated_at on public.user_integrations;
create trigger user_integrations_set_updated_at before update on public.user_integrations
for each row execute function public.set_updated_at();
