# Plano — Substituir N8N por Fan-out nativo no CallX

> Objetivo: eliminar a dependência do N8N para distribuir os resultados das chamadas, trazendo o roteamento (WhatsApp, CRM, webhooks, etc.) para dentro do próprio CallX, com UI, filtros, templates e observabilidade.

---

## Contexto atual (pré-refactor)

**Fluxo hoje:**

```
Vapi (end-of-call-report)
  → POST /api/webhooks/vapi/{tenantId}
    → handleEndOfCallReport  (atualiza call_records + leads)
    → scheduleOutboundWebhook  (fire-and-forget via next/after)
      → POST único para dial_queues.webhook_url (N8N)
        → N8N aplica filtros/templates e chama WhatsApp / CRM / etc.
```

**Limitações que forçam o uso do N8N:**

- `dial_queues.webhook_url` é **uma única URL por fila**.
- Não há **filtros** (todo end-of-call dispara, independente de status ou structured_outputs).
- Não há **transformação** — o payload sai bruto, e o N8N cuida do mapping.
- Não há **logs de entrega** persistidos no CallX (quando o N8N falha, não aparece aqui).

**O que já temos a favor:**

- Retry 3× com backoff (0s / 3s / 10s) e timeout de 15s já implementado em `fireOutboundWebhook` (`src/app/api/webhooks/vapi/[tenantId]/route.ts:987-1033`).
- Payload outbound rico: `structured_outputs`, `transcript`, `summary`, `recording_url`, `cost`, `customer`, `lead.data`, `lead_status`, `ended_reason`.
- Criptografia AES-256-GCM pronta para credenciais de terceiros (`src/lib/crypto.ts`).

---

## Fase 1 — Modelo de dados

### Migration `outbound_actions` + `outbound_deliveries`

```sql
-- Destinos configuráveis por tenant e (opcionalmente) por fila
create table outbound_actions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  queue_id       uuid references dial_queues(id) on delete cascade, -- NULL = aplica a todas as filas do tenant
  name           text not null,                                     -- ex: "WhatsApp vendedor", "HubSpot deal"
  kind           text not null,                                     -- ver enum abaixo
  enabled        boolean not null default true,
  config_json    jsonb not null default '{}'::jsonb,                -- endpoints/credenciais (encrypted fields onde aplicável)
  filter_json    jsonb not null default '{}'::jsonb,                -- condições para disparar
  template_json  jsonb not null default '{}'::jsonb,                -- body/mensagem parametrizada
  max_retries    int   not null default 3,
  timeout_ms     int   not null default 15000,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on outbound_actions (tenant_id, enabled);
create index on outbound_actions (queue_id) where queue_id is not null;

-- Log de cada disparo (observabilidade + retry manual)
create table outbound_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  outbound_action_id  uuid not null references outbound_actions(id) on delete cascade,
  call_record_id      uuid not null references call_records(id) on delete cascade,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  status              text not null,                 -- pending | delivered | failed | skipped_by_filter
  http_status         int,
  request_preview     text,                           -- primeiros ~500 chars do body enviado
  response_body       text,                           -- primeiros ~500 chars da resposta
  attempts            int  not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  delivered_at        timestamptz
);

create index on outbound_deliveries (tenant_id, created_at desc);
create index on outbound_deliveries (call_record_id);
create index on outbound_deliveries (status) where status in ('failed','pending');
```

**Enum de `kind` (v1):**

- `http_webhook` — POST genérico (paridade com N8N)
- `whatsapp_evolution` — Evolution API self-hosted
- `whatsapp_meta_cloud` — WhatsApp Business Cloud API (oficial)
- `hubspot` — criar/atualizar contato + deal + nota
- `pipedrive` — criar/atualizar person + deal + activity
- `rdstation` — conversão + atualização de contato
- `google_sheets` — append row (service account)
- `email` — via Resend/SES

### Formato dos JSONs

**`filter_json`** (AND implícito entre chaves):

```json
{
  "lead_status": ["completed", "callbackScheduled"],
  "ended_reason_not_in": ["silence-timed-out"],
  "structured_outputs": { "vendeu_plano": true },
  "min_duration_seconds": 10
}
```

**`template_json`** (varia por `kind`; exemplo WhatsApp):

```json
{
  "to": "{{lead.data.vendedor_telefone}}",
  "text": "✅ *{{customer.name}}* ({{customer.number}}) fechou o plano {{structured_outputs.plano}}.\n\nResumo: {{summary}}"
}
```

**`config_json`** (exemplo Evolution API):

```json
{
  "base_url": "https://evolution.cliente.com",
  "instance": "atendimento",
  "api_key_encrypted": "<AES-GCM blob>"
}
```

---

## Fase 2 — Motor de envio

Substituir o POST único dentro de `scheduleOutboundWebhook` por um despachador:

```
fireOutboundWebhook(leadId, queueId, tenantId, ..., callData)
  ├─ legacy: se dial_queues.webhook_url ≠ NULL → envia como hoje (back-compat)
  └─ novo:   carrega outbound_actions (tenant_id, enabled=true, queue_id IN (queueId, NULL))
             para cada action:
               ├─ avaliar filter_json contra o payload
               │    - se falhar → grava delivery com status 'skipped_by_filter'
               ├─ renderizar template_json (Handlebars/Mustache, sem JS arbitrário)
               ├─ chamar adapter[kind](config, rendered_template)
               ├─ retry com backoff (0s / 3s / 10s)
               └─ grava outbound_deliveries (status, http_status, response_body, attempts)
```

### Decisões técnicas

- **Templating:** Handlebars (safe mode, sem helpers arbitrários) OU biblioteca minimal `{{path.to.field}}`. Evitar `eval` ou `new Function` (risco de injeção entre tenants).
- **Avaliação de filtros:** iniciar com `lodash.matches`/`_.get` — simples e suficiente. Evoluir para JSONPath se precisar de operadores avançados.
- **Paralelismo:** `Promise.allSettled` em cima das actions — uma falha não bloqueia as outras.
- **Onde roda:** continua no handler do webhook Vapi via `next/after` (Fluid Compute aguenta bem). Se o p95 subir acima de ~15s por ação, migrar para **Vercel Queues** (at-least-once, durable) sem mudar o contrato externo.

---

## Fase 3 — Adapters (ordem de valor)

| # | Adapter | Motivo de vir primeiro | Esforço |
|---|---------|------------------------|---------|
| 1 | `http_webhook` | Paridade direta com N8N → permite migração gradual | S |
| 2 | `whatsapp_evolution` | Caso de uso mais comum dos clientes atuais | M |
| 3 | `whatsapp_meta_cloud` | Clientes enterprise / compliance | M |
| 4 | `google_sheets` | Clientes pequenos que querem dashboard simples | S |
| 5 | `hubspot` | CRM mais requisitado | M |
| 6 | `pipedrive` | CRM popular no mid-market BR | M |
| 7 | `rdstation` | CRM comum no mercado BR | M |
| 8 | `email` (Resend) | Notificação simples / fallback | S |

**Convenção do adapter:**

```ts
type AdapterResult = { ok: true; response: string } | { ok: false; error: string; httpStatus?: number };
type Adapter = (config: Record<string, unknown>, rendered: Record<string, unknown>) => Promise<AdapterResult>;
```

Um arquivo por adapter em `src/lib/outbound/adapters/{kind}.ts`. Registro central em `src/lib/outbound/registry.ts`.

---

## Fase 4 — UI nova

### Rota `/app/tenants/{tenantId}/integrations`

- Lista de "Ações de Saída" (cards por kind, com badge on/off).
- Botão "Nova ação" → modal/drawer com:
  - Seletor de `kind` (ícone + nome).
  - Form específico por kind (campos de `config_json`).
  - Seletor de escopo: **todas as filas** ou **uma fila específica**.
  - Editor de filtros (dropdowns amigáveis para `lead_status`, `ended_reason`, `structured_outputs`).
  - Editor de template com:
    - Preview usando uma call real (dropdown "Testar com call #123").
    - Árvore de variáveis disponíveis (`lead.data.*`, `customer.*`, `structured_outputs.*`, etc.).
  - Botão "Testar envio agora" (dispara com payload mock).

### Rota `/app/tenants/{tenantId}/integrations/deliveries`

- Tabela de `outbound_deliveries` (últimos N dias).
- Filtros: ação, status, fila.
- Detalhe da entrega: body enviado, resposta, tentativas, erro.
- Botão "Reenviar" (insere nova delivery pendente e dispara o adapter).

---

## Fase 5 — Migração & rollout

### Backward compatibility
- Manter `dial_queues.webhook_url` funcionando durante a transição.
- Criar migration de dados: para cada queue com `webhook_url ≠ NULL`, inserir `outbound_actions` com `kind='http_webhook'`, `config_json={url: ...}`, `filter_json={}`.
- Depois da migração **e** de 1 semana de coexistência, deprecar `webhook_url` (UI remove, route ignora).

### Feature flag por tenant
- Coluna `tenants.outbound_engine_v2 boolean default false`.
- Ligar por tenant para testar com clientes piloto.
- Depois de estável: flip global e remover flag.

### Rollout sugerido
1. Merge do motor novo + adapter `http_webhook`, flag desligada → deploy.
2. Ligar flag em 1 tenant interno → validar paridade com N8N por 3 dias.
3. Adicionar `whatsapp_evolution` → ligar em 1 cliente piloto.
4. Adicionar `google_sheets` + `whatsapp_meta_cloud`.
5. Adicionar os 3 CRMs em batch.
6. Migração em massa + remoção do N8N.

---

## Segurança & operação

- Credenciais em `config_json` passam por `encrypt()` do `src/lib/crypto.ts` antes de persistir; campos com sufixo `_encrypted` sinalizam.
- **Rate limits por adapter + tenant:** token bucket em memória (por enquanto), migrar para Upstash Redis se necessário. Meta Cloud ≈ 80 msg/s; Evolution depende da instância.
- **PII em logs:** `outbound_deliveries.request_preview` truncado em 500 chars, e o body completo não é persistido.
- **Alertas:** job diário conta `outbound_deliveries` com `status='failed'` por tenant; acima de limite → notifica admins (email/Slack).
- **Observabilidade:** manter os `console.log` no padrão `[outbound/{kind}] ...` para serem filtrados em Vercel/Railway.

---

## Estimativa (em sprints de 1 semana)

| Fase | Escopo | Sprint |
|------|--------|--------|
| 1 | Migration + tipos | 0.5 |
| 2 | Motor + registry + filter eval + templating | 1 |
| 3a | `http_webhook` + `whatsapp_evolution` | 1 |
| 4a | UI mínima (listar/criar/editar/on-off) | 1 |
| 4b | UI de deliveries + teste de envio | 0.5 |
| 3b | `google_sheets` + `whatsapp_meta_cloud` + `email` | 1 |
| 3c | `hubspot` + `pipedrive` + `rdstation` | 1.5 |
| 5 | Migração de dados + feature flag + rollout | 0.5 |

**Total estimado:** ~7 sprints (≈ 7 semanas) para paridade total com N8N + cobertura dos adapters mais pedidos.

---

## Fora de escopo (v1 — considerar depois)

- Branching/workflow gráfico dentro do CallX (o atrativo do N8N é justamente isso — não tentar competir).
- Encadeamento entre actions ("se WhatsApp falhar, manda email").
- Agregação de eventos (ex: "no fim do dia, manda resumo"). Pode virar um `scheduled_report` separado.
- Multi-webhook para outros eventos fora de `end-of-call-report` (ex: `queue.started`, `lead.imported`).
