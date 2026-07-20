# Provisiona — Templates recorrentes, materialização e parser de boleto

Data: 2026-07-20 · Status: aprovado em conversa (carta branca)

## Problema

O usuário não quer digitar boleto a boleto. Despesas recorrentes (luz, telefone, clube 3/3 meses, UVV) devem ser cadastradas uma vez como **modelo** e gerar automaticamente a **despesa real (ocorrência)** de cada período, que nasce "aguardando documento" sem valor. Quando o boleto chega (Gmail/WhatsApp→Gmail), colar a linha digitável preenche valor e vencimento.

## Modelo de dados

**Nova tabela `recurring_templates`** (RLS por user): title, category, frequency (`monthly|bimonthly|quarterly|semiannual|annual`), due_day (1–31, clamp em mês curto), anchor_month (referência para frequências não mensais, formato YYYY-MM), nominal_amount (opcional), payer_name, source_channel, sender, locator_hint, payment_method, bank_account, active.

**`bills`**: ganha `template_id` (FK opcional, on delete set null) e `period` (YYYY-MM); `amount` passa a aceitar NULL (ocorrência sem valor ainda). Índice único parcial (template_id, period) garante materialização idempotente. O clone-ao-pagar (recorrência antiga) é removido; o campo `recurring` fica como legado.

## Materialização (client-side, dual-mode)

Ao abrir o app (e após login/load): para cada template ativo, se o período corrente casa com a frequência (diferença de meses desde anchor_month divisível pelo passo) e não existe bill com (template_id, period), cria ocorrência: título/campos do template, dueDate = dia clampado no mês, amount = null, status waiting_document. Também materializa o próximo período quando o vencimento do corrente já passou (visibilidade de provisão). Funciona offline; em modo supabase o save sincroniza.

## Parser de linha digitável (`src/utils/boleto.js`)

- 47 dígitos (título bancário): valida DV mod10 dos 3 campos; extrai fator de vencimento (4) e valor (10, centavos). Fator: base 1997-10-07 + fator; a partir do reset FEBRABAN, fator 1000 = 2025-02-22 — escolher a data candidata mais plausível (janela −1a/+3a de hoje).
- 48 dígitos (arrecadação/convênio, inicia com 8): reconstrói o código de barras removendo o 12º dígito (DV) de cada bloco; valor = posições 5–15; vencimento não padronizado → só valor.
- Retorna `{ amount, dueDate|null, kind }` ou `null` se inválido.

## UI

- Vista "Contas a pagar" ganha alternância **Ocorrências | Modelos** (q-btn-toggle). Modelos: lista com frequência/dia/fonte + editor em diálogo próprio + toggle ativo + excluir.
- Editor de despesa: campo valor vira opcional (obrigatório apenas se status pago/agendado — regra simples: opcional sempre, banco aceita null); ao colar/alterar a linha digitável, parser preenche valor/vencimento e muda status para document_found, com Notify.
- Login/pushLocal também sincroniza templates.

## Fora de escopo

Busca automática no Gmail (Edge Function) — próxima etapa; leitura de PDF por IA; WhatsApp API.

## Critérios de sucesso

- Cadastrar modelo mensal e trimestral → ocorrências surgem sozinhas no mês certo, sem duplicar em reloads.
- Colar linha digitável válida (47) preenche valor e vencimento corretos; 48 preenche valor.
- Pagar ocorrência não clona mais; próximo período vem do modelo.
- Tudo funciona em modo local e sincronizado; lint/build ok; produção atualizada.
