# Provisiona MVP

PWA em Nuxt 4, Vue e Quasar para organizar boletos, fontes, remetentes, provisão de saldo e alertas.

A interface é mobile-first: navegação inferior, cadastro em bottom sheet, safe areas para PWA, tema claro/escuro persistente e expansão progressiva para tablet e desktop.

## Executar

```bash
npm install
npm run dev
```

O app abre em modo demonstração e salva alterações no `localStorage`. Com uma sessão Supabase ativa, passa a sincronizar os compromissos protegidos por RLS.

## Conectar ao Supabase

1. Aplique as migrations em `supabase/migrations/` na ordem do nome.
2. Copie `.env.example` para `.env` e preencha a URL e a chave publicável.
3. Em Auth → URL Configuration, inclua `http://localhost:9100/**` durante o desenvolvimento.
4. Autentique o usuário por link de e-mail. Quando houver sessão, o app passa a carregar e salvar as tabelas protegidas por RLS.

Nunca use uma chave `service_role` no frontend.

## PWA de produção

```bash
npm run generate
```

O site estático fica em `.output/public/` (inclui service worker e manifesto).

## Deploy (Vercel)

Produção: **https://provisiona-one.vercel.app**

O projeto Vercel `provisiona` está vinculado a este diretório (`.vercel/`) e ao repositório GitHub. O `vercel.json` define build estático (`npm run generate` → `.output/public`). Para publicar:

```bash
npx vercel deploy --prod --yes
```

As variáveis `NUXT_PUBLIC_SUPABASE_URL` e `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` já estão configuradas nos ambientes production e preview da Vercel.

## Login com Google

1. No Google Cloud Console, crie uma credencial OAuth (Aplicativo da Web) com redirect `https://<ref>.supabase.co/auth/v1/callback`.
2. No painel Supabase → Authentication → Providers → Google, ative e informe Client ID/Secret.
3. Em Authentication → URL Configuration, adicione `http://localhost:9100/**` e `https://provisiona-one.vercel.app/**`.

O link mágico por e-mail funciona sem configuração extra.

## Escopo do MVP

- painel de necessidade de saldo;
- CRUD de despesas e boletos;
- origem, remetente e regra de localização;
- linha digitável com cópia em um toque;
- visualização de alertas D-7, D-1, dia do vencimento e D+1;
- persistência local com estrutura opcional Supabase;
- service worker e manifesto PWA.

A busca real no Gmail, o recebimento pelo WhatsApp e o disparo de mensagens exigem conectores/Edge Functions e ficam para a próxima etapa.
