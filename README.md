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
npm run build
```

O resultado de produção fica em `.output/`; os arquivos públicos e o service worker ficam em `.output/public/`.

## Escopo do MVP

- painel de necessidade de saldo;
- CRUD de despesas e boletos;
- origem, remetente e regra de localização;
- linha digitável com cópia em um toque;
- visualização de alertas D-7, D-1, dia do vencimento e D+1;
- persistência local com estrutura opcional Supabase;
- service worker e manifesto PWA.

A busca real no Gmail, o recebimento pelo WhatsApp e o disparo de mensagens exigem conectores/Edge Functions e ficam para a próxima etapa.
