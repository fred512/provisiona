select cron.schedule(
  'sync-boletos-daily',
  '0 10 * * *', -- 07:00 America/Sao_Paulo, antes do lembrete das 08:00
  $$
  select net.http_post(
    url := 'https://vhofmefbhtetyzuujelq.supabase.co/functions/v1/sync-boletos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
) where not exists (select 1 from cron.job where jobname = 'sync-boletos-daily');
