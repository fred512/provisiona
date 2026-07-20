-- Gravação do refresh token via função SECURITY DEFINER: o cliente só chama
-- o RPC, nunca escreve direto na tabela. Evita depender de policy/grant de
-- INSERT no navegador e mantém o token fora de qualquer leitura do cliente.
create or replace function public.store_google_token(token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.user_integrations (user_id, google_refresh_token, gmail_connected_at)
  values (auth.uid(), token, now())
  on conflict (user_id) do update
    set google_refresh_token = excluded.google_refresh_token,
        gmail_connected_at = now();
end;
$$;

revoke all on function public.store_google_token(text) from public, anon;
grant execute on function public.store_google_token(text) to authenticated;
