# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Provisiona é uma PWA mobile-first (pt-BR) para organizar boletos, provisão de saldo e alertas de vencimento. Stack: Nuxt 4 (SPA, `ssr: false`), Vue 3, Quasar 2 e Supabase (`@supabase/supabase-js`). PWA via `@vite-pwa/nuxt`.

## Comandos

```bash
npm run dev       # dev server em http://127.0.0.1:9100
npm run build     # build de produção → .output/ (públicos + service worker em .output/public/)
npm run lint      # eslint . --ext .js,.ts,.vue
```

Não há testes configurados.

## Arquitetura

O código-fonte fica em `src/` (`srcDir` configurado em [nuxt.config.ts](nuxt.config.ts)). Não há `pages/` nem roteamento: **toda a UI vive em [src/app.vue](src/app.vue)** — dashboard, lista de contas, origens e alertas são alternados por um `ref` `activeView`, e o cadastro/edição abre em `q-dialog` (bottom sheet no mobile, painel lateral no desktop).

Fluxo de dados (dual-mode local/Supabase):

- [src/composables/useBills.js](src/composables/useBills.js) é a única fonte de estado (refs em escopo de módulo, compartilhadas entre chamadas). Sempre persiste em `LocalStorage` (chave `provisiona:bills:v1`); parte dos dados demo de [src/data/demoBills.js](src/data/demoBills.js).
- `syncMode` começa em `'local'` e vira `'supabase'` após `load()` com sessão autenticada; a partir daí `save()` também faz upsert na tabela `bills`. Os mapeadores `toRow`/`fromRow` convertem camelCase (app) ↔ snake_case (banco) — ao adicionar campo em bill, atualize os dois e a migration.
- [src/plugins/supabase.client.js](src/plugins/supabase.client.js) provê `$supabase` e `$isSupabaseConfigured` a partir de `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`.env`, ver `.env.example`). O client é `null` quando não configurado — sempre cheque `$isSupabaseConfigured` antes de usar. Nunca use chave `service_role` no frontend.
- [src/plugins/quasar.client.js](src/plugins/quasar.client.js) registra Quasar com os plugins Dialog, LocalStorage e Notify e as cores da marca.

### Banco (Supabase)

Migrations em `supabase/migrations/`, aplicadas na ordem do nome. Tabelas `bills` e `reminder_events`, ambas com RLS por `user_id` (`auth.uid()`) e CHECKs que restringem valores de `source_channel`, `payment_method`, `bank_account` e `status` — os valores usados na UI devem casar com esses CHECKs. Autenticação por link de e-mail; em dev, inclua `http://localhost:9100/**` na URL Configuration do Auth.

### Legado

`src-pwa/`, `index.html` (raiz), `dist/` e `.quasar/` são resquícios do setup Quasar CLI anterior à migração para Nuxt e não participam do build atual (a PWA é gerada pelo `@vite-pwa/nuxt` configurado em `nuxt.config.ts`).

## Escopo

MVP local-first; busca real no Gmail, recebimento por WhatsApp e disparo de mensagens dependem de conectores/Edge Functions e estão fora do escopo atual (a tabela `reminder_events` já existe para essa etapa).
