-- Marca anexos de e-mail já processados, para não reparsear PDF pesado a cada
-- execução. Acessada só pela Edge Function (service_role); sem grants públicos.
create table if not exists public.synced_attachments (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  attachment_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id, attachment_id)
);

alter table public.synced_attachments enable row level security;
