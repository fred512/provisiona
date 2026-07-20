# Provisiona — Polimento do MVP: auth Google, CRUD completo, recorrência, relatório e deploy

Data: 2026-07-19 · Status: aprovado pelo usuário (carta branca na execução)

## Objetivo

Fechar as pontas soltas do MVP e torná-lo utilizável de verdade no celular: autenticação real com Supabase (Google + link mágico), CRUD completo com validações, recorrência funcional, um relatório de análise de gastos e a PWA instalável publicada na Vercel.

## Contexto

App Nuxt 4 SPA (`ssr: false`), toda a UI em `src/app.vue` (vistas trocadas por `activeView`), estado único em `src/composables/useBills.js` com persistência dual: sempre em `localStorage`, e upsert no Supabase quando `syncMode === 'supabase'`. Banco já tem `bills` e `reminder_events` com RLS por usuário. Não há UI de login, exclusão, validações, relatório nem ícones PWA.

Decisões de abordagem (aprovadas): evoluir a estrutura atual sem refatorar para páginas/componentes; lógica de recorrência no cliente (o app funciona offline); deploy via Vercel CLI (repo é só local, sem remote).

## 1. Autenticação (Supabase Auth)

- Novo composable `src/composables/useAuth.js`: estado de sessão (`user`), `signInWithGoogle()` (`signInWithOAuth({ provider: 'google' })`), `signInWithEmail(email)` (magic link), `signOut()`, listener `onAuthStateChange`.
- UI: o pill de sync no topo abre um diálogo de conta — sem sessão: botão "Entrar com Google" + campo de e-mail para link mágico; com sessão: e-mail do usuário + sair.
- Ao detectar sessão: se a tabela `bills` remota estiver vazia e houver dados locais, perguntar se importa os dados locais (upsert em lote); senão, carregar do remoto (`load()`). Logout volta ao modo local sem apagar o `localStorage`.
- Configuração manual (fora do código, com instruções ao usuário): provider Google no painel Supabase (Client ID/secret do Google Cloud Console) e URLs de redirect (localhost:9100 e URL de produção da Vercel).

## 2. CRUD completo e validações

- `remove(id)` em `useBills`: remove local e, em modo supabase, `delete` na tabela. Botão "Excluir" no editor com `Dialog` de confirmação.
- Marcar como paga em um toque: ação no card/linha da despesa (sem abrir o editor).
- Validações no formulário com `rules` do Quasar, espelhando os CHECKs do banco: título 2–120 caracteres, valor ≥ 0 obrigatório, vencimento obrigatório; salvar bloqueado se inválido.

## 3. Recorrência

Em `markPaid()`: se `recurring`, gerar a próxima ocorrência automaticamente — novo id, vencimento no mesmo dia +1 mês (com clamp para fim de mês curto, ex.: 31/jan → 28/fev), `status: 'waiting_document'`, `amount = nominalAmount || amount`, `barcode` limpo, `documentExpectedAt`/`discountUntil` deslocados +1 mês quando existirem. Notify confirmando a criação.

## 4. Relatório de despesas

- Novo item de navegação "Relatório" (`activeView === 'report'`).
- Agregações client-side sobre `bills`: total por mês (últimos 6 meses, por `dueDate`), quebra por categoria e por conta pagadora (Nubank/CAIXA), pago vs. em aberto do mês corrente.
- Visual: barras/números no estilo visual atual do app (CSS puro, sem lib de gráfico — carregar a skill dataviz antes de construir).

## 5. PWA + deploy Vercel

- Gerar `public/icons/icon-192x192.png` e `icon-512x512.png` (marca nas cores do app, maskable) — hoje o manifest referencia arquivos inexistentes e a instalação quebra.
- Deploy via Vercel CLI (preset Nuxt/nitro automático), env vars `NUXT_PUBLIC_SUPABASE_URL` e `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no projeto Vercel.
- Pós-deploy: incluir a URL de produção no Supabase Auth → URL Configuration.

## Fora de escopo

Busca real no Gmail, WhatsApp, disparo de alertas (reminder_events), saldo informado editável, refatoração em componentes/páginas.

## Critérios de sucesso

- Login com Google funciona em produção; dados sincronizam com RLS e sobrevivem a logout/login.
- Excluir, marcar como paga e validações funcionam nos dois modos (local e supabase).
- Pagar despesa recorrente cria a do mês seguinte corretamente (incl. fim de mês).
- Relatório mostra gastos por mês, categoria e conta coerentes com os dados.
- PWA instalável (ícones válidos) servida em HTTPS na Vercel.

## Testes

Projeto não tem infra de testes; verificação manual guiada: lint, build, fluxo completo no navegador (dev e produção) cobrindo os critérios acima.
