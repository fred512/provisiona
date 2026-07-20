# Provisiona — Rotina autônoma de leitura de boletos no Gmail

Data: 2026-07-20 · Status: aprovado (usuário escolheu "construir a rotina autônoma")

## Objetivo

Preencher automaticamente valor, vencimento e linha digitável das despesas do usuário lendo os boletos que chegam no Gmail (fredborges512@gmail.com), sem digitação manual. Cobre boletos com dados no corpo do e-mail (Vivo) e boletos só em PDF anexo (UVV, Álvares).

## Arquitetura

Edge Function `sync-boletos` no Supabase, acionável por (a) botão "Sincronizar boletos" na UI e (b) cron diário. Fluxo por usuário:

1. Lê o refresh token Google do usuário (tabela `user_integrations`, via service_role).
2. Troca por access token em `oauth2.googleapis.com/token` (usa GOOGLE_CLIENT_ID/SECRET como secrets da função).
3. Para cada `recurring_template` do usuário com `sender` preenchido, busca no Gmail: `from:<sender> newer_than:60d`.
4. Para cada mensagem: extrai candidatos a linha digitável (a) do corpo (texto/HTML) e (b) de cada anexo PDF, baixado via `users.messages.attachments.get` e lido com `unpdf` (extração de texto, sem OCR).
5. Roda o parser de boleto (mesma lógica de `src/utils/boleto.js`, portada) sobre os candidatos; primeiro válido vence.
6. Casa com a ocorrência (`bills`) do template: escolhe a bill em aberto (`status != paid`, `barcode is null`) do período correspondente ao vencimento do boleto (ou a mais próxima). Atualiza `amount`, `due_date`, `barcode`, `status='document_found'`.
7. Idempotente: pula bill que já tem `barcode`. Registra resultado por bill.

## Acesso ao Gmail (pré-requisito do usuário)

- No Google Cloud Console (mesmo projeto do login): adicionar o escopo `https://www.googleapis.com/auth/gmail.readonly` na tela de consentimento OAuth e incluir o usuário como test user (app em modo testing — escopo restrito funciona sem verificação para test users).
- No login do app: `signInWithOAuth` passa a pedir o escopo gmail.readonly com `access_type=offline` e `prompt=consent`.
- Ao voltar do OAuth, o cliente captura `session.provider_refresh_token` e grava em `user_integrations` (upsert). O refresh token só vem nesse primeiro consentimento — daí a necessidade de reautorizar uma vez.

## Dados

`user_integrations`: user_id (PK, FK auth.users), google_refresh_token text, updated_at. RLS: authenticated pode INSERT/UPDATE a própria linha (o cliente grava o token), **sem policy de SELECT** (cliente não relê o token). Edge Function usa service_role (bypassa RLS).

`bills` já tem barcode/amount/due_date/status — sem mudança de schema.

## Segurança

- Refresh token nunca volta ao cliente (sem SELECT). Nunca logar o token. GOOGLE_CLIENT_SECRET só como secret da função.
- Escopo mínimo: `gmail.readonly` (só leitura).

## Fora de escopo

Reconciliação de pagamento por CSV/extrato (rotina separada); OCR de boleto que seja imagem (se o PDF não tiver texto extraível, a bill é marcada para conferência manual, não falha).

## Critérios de sucesso

- Após reconsentimento, botão "Sincronizar" preenche as bills cujos boletos estão no Gmail (Vivo pelo corpo; UVV/Álvares pelo PDF), com valor/vencimento/linha digitável corretos.
- Não duplica nem sobrescreve bill já preenchida; não expõe o refresh token ao cliente.
- Cron diário roda a mesma rotina para todos os usuários com integração ativa.
