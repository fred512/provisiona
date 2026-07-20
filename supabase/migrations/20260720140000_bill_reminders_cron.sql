create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.schedule(
  'send-bill-reminders-daily',
  '0 11 * * *', -- 08:00 America/Sao_Paulo (sem horário de verão desde 2019)
  $$
  select net.http_post(
    url := 'https://vhofmefbhtetyzuujelq.supabase.co/functions/v1/send-bill-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
) where not exists (select 1 from cron.job where jobname = 'send-bill-reminders-daily');
