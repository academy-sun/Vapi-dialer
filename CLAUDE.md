# CLAUDE.md — Vapi Dialer (MX3 CallX)

Documento de contexto para sessões Claude. Leia antes de começar qualquer tarefa.

---

## 1. Visão Geral do Projeto

**MX3 CallX** é um discador automático SaaS multi-tenant integrado à **Vapi** (plataforma de IA de voz).
Permite que organizações criem campanhas de ligação automática com agentes de IA configuráveis.

**Produção:** `https://mx3-callx.vercel.app`
**Repositório:** `https://github.com/academy-sun/Vapi-dialer.git`
**Branch principal:** `main` (fluxo: `staging` → PR → `main`)

---

## 2. Stack Técnico

| Camada | Tecnologia |
|--------|-----------|
| Frontend + API | Next.js 15 (App Router, TypeScript) |
| Banco de dados | Supabase (PostgreSQL + Auth + RLS) |
| Estilização | Tailwind CSS 3 |
| Ícones | Lucide React |
| Chamadas AI | Vapi API (`https://api.vapi.ai`) |
| Worker background | Node.js + tsx (processo único, sem BullMQ) |
| Deploy frontend | Vercel |
| Deploy worker | Railway |
| Criptografia API Keys | AES-256-GCM (`src/lib/crypto.ts`) |

---

## 3. Estrutura de Arquivos

```
src/
├── app/
│   ├── (app)/app/tenants/[tenantId]/
│   │   ├── vapi/          → Configuração Vapi (API key, concorrência, webhook)
│   │   ├── queues/        → Gerenciar filas de discagem
│   │   ├── leads/         → Listas de leads
│   │   ├── calls/         → Histórico de chamadas (com paginação 15/50/100)
│   │   ├── assistants/    → Editor de assistentes Vapi
│   │   ├── analytics/     → Analytics (heatmap, talk time, end reasons, custo)
│   │   └── members/       → Membros da organização
│   ├── api/
│   │   ├── tenants/[tenantId]/
│   │   │   ├── vapi-connection/route.ts     → GET/POST/DELETE da API key
│   │   │   ├── vapi-assistant/route.ts      → GET/PATCH assistente Vapi
│   │   │   ├── vapi-resources/route.ts      → Listar assistentes e números Vapi
│   │   │   ├── queues/[queueId]/
│   │   │   │   ├── start|stop|pause/        → Controle da fila
│   │   │   │   ├── progress/route.ts        → Stats em tempo real da fila
│   │   │   │   └── diagnose/route.ts        → Diagnóstico de saúde da fila
│   │   │   ├── lead-lists/[id]/
│   │   │   │   ├── import/route.ts          → Upload CSV
│   │   │   │   ├── leads/route.ts           → CRUD leads
│   │   │   │   ├── webhook/route.ts         → Webhook externo de leads
│   │   │   │   └── reset-stuck/route.ts     → Reset leads travados em "calling"
│   │   │   ├── calls/route.ts               → Listagem de call_records
│   │   │   ├── analytics/route.ts           → API analytics completa
│   │   │   ├── members/route.ts             → Gerenciamento de membros
│   │   │   └── assistant-configs/route.ts   → Config por assistente (campos de sucesso)
│   │   ├── webhooks/vapi/[tenantId]/route.ts → Webhook end-of-call-report do Vapi
│   │   └── admin/tenants/route.ts           → Admin global: listar todos os tenants
├── components/
│   └── AppShell.tsx    → Layout principal, nav lateral, troca de tenant
├── lib/
│   ├── auth-helper.ts  → requireTenantAccess() com bypass para admin global
│   ├── admin-helper.ts → isAdminEmail() + requireAdmin()
│   ├── crypto.ts       → encrypt()/decrypt() AES-256-GCM
│   └── supabase/
│       ├── server.ts   → createClient() (cookies, Server Components)
│       └── service.ts  → createServiceClient() (service role, sem RLS)
worker/
└── src/index.ts        → Worker de discagem (loop polling 5s no Railway)
supabase/migrations/    → Migrations SQL (001–010)
```

---

## 4. Modelo de Dados (Tabelas Principais)

```sql
tenants          -- organizações (id, name, timezone)
memberships      -- user ↔ tenant, role: owner|admin|member
vapi_connections -- API key Vapi por tenant (encrypted_private_key, is_active)
lead_lists       -- listas de leads por tenant
leads            -- lead individual (phone_e164, status, data_json, next_attempt_at)
dial_queues      -- fila de discagem (assistant_id, phone_number_id, concurrency, allowed_time_window)
call_records     -- registro de cada chamada (vapi_call_id, ended_reason, cost, transcript, structured_outputs)
assistant_snapshots    -- backup automático antes de editar assistente no Vapi
assistant_configs      -- config por assistente/tenant (success_field para analytics)
```

**Lead statuses:** `new` → `queued` → `calling` → `completed|failed|doNotCall|callbackScheduled`

---

## 5. Autenticação e Controle de Acesso

### Roles
- `owner` — acesso total ao tenant
- `admin` — acesso total ao tenant
- `member` — acesso limitado (sem Vapi Config, sem membros)

### Admin Global (Sistema)
- Emails definidos na env var `ADMIN_EMAILS` (vírgula separado)
- `isAdminEmail()` em `src/lib/admin-helper.ts`
- Admin global tem acesso de `owner` em **qualquer** tenant sem membership row
- `requireTenantAccess()` retorna `{ role: "owner" }` para admins
- `AppShell.tsx`: `isAdminOrOwner = isAdmin || activeRole === "owner" || activeRole === "admin"`
- `selectTenant()` navega para `/vapi` para admin global, `/queues` para membros

---

## 6. Worker de Discagem

**Arquivo:** `worker/src/index.ts`
**Deploy:** Railway (serviço separado, Node.js)
**Variáveis obrigatórias no Railway:**
```
SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY_BASE64
APP_BASE_URL=https://mx3-callx.vercel.app   ← CRÍTICO: atualizar ao mudar domínio
POLL_INTERVAL_MS=5000
DISPATCH_DELAY_MS=3000
```

**Como funciona:**
1. Polling a cada 5s → busca `dial_queues` com `status='running'`
2. Verifica janela de horário (`allowed_days` + `allowed_time_window` + timezone)
3. Conta chamadas ativas para respeitar concorrência (`concurrency` + `org_concurrency_limit`)
4. Para cada slot livre: busca lead `new/callbackScheduled` com `next_attempt_at <= now`
5. Chama `POST /call/phone` na Vapi (NÃO passa `serverUrl` no payload de chamada)
6. Cria `call_record` + atualiza lead para `calling`
7. Retry com jitter se cair fora da janela de horário

**Concorrência global por tenant:** tabela `vapi_connections` tem `org_concurrency_limit`

---

## 7. Integração Vapi

### Webhook (end-of-call-report)
- URL: `https://mx3-callx.vercel.app/api/webhooks/vapi/{tenantId}`
- Configurado no assistente via `PATCH /assistant/{id}` com `{ server: { url: "..." } }`
- **ATENÇÃO:** Vapi PATCH assistant NÃO aceita `server.messages` — apenas `server.url`

### Payload correto para atualizar webhook no assistente:
```typescript
// CORRETO ✓
{ server: { url: "https://mx3-callx.vercel.app/api/webhooks/vapi/{tenantId}" } }

// ERRADO ✗ — Vapi ignora silenciosamente
{ serverUrl: "..." }

// ERRADO ✗ — Vapi retorna 400: "server.property messages should not exist"
{ server: { url: "...", messages: [...] } }
```

### Chamada via Worker (POST /call/phone)
- Payload: `{ assistantId, customer: { number }, phoneNumberId }`
- **NÃO** incluir `serverUrl` no payload de chamada — Vapi usa a config do assistente
- Webhook já está configurado no assistente, não precisa passar por chamada

---

## 8. Variáveis de Ambiente (Next.js / Vercel)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY_BASE64          ← AES-256-GCM key (32 bytes em base64)
ADMIN_EMAILS                   ← emails dos admins globais (vírgula separado)
APP_BASE_URL=https://mx3-callx.vercel.app
```

---

## 9. Git Flow

```
feature/fix branch → staging → PR → main
```
- `gh` CLI não instalado — usar git push + interface web para PRs
- Commits com Co-Authored-By: Claude

---

## 10. Páginas e Funcionalidades

| Página | Rota | Acesso |
|--------|------|--------|
| Configuração Vapi | `/vapi` | owner/admin |
| Filas de Discagem | `/queues` | todos |
| Listas de Leads | `/leads` | todos |
| Chamadas | `/calls` | todos |
| Assistentes | `/assistants` | owner/admin |
| Analytics | `/analytics` | owner/admin |
| Membros | `/members` | owner/admin |

### Features implementadas:
- **Calls:** paginação 15/50/100 + sort por score, duração, custo, data
- **Analytics:** heatmap por hora/dia, talk time breakdown, end reasons, custo/min, custo/lead
- **Assistentes:** editor de nome, firstMessage, systemPrompt, voz; success field selector
- **Vapi Config:** compact API key state, webhook do assistente, controle de concorrência
- **Admin global:** acessa qualquer tenant, nav mostra Configuração Vapi sem membership

---

## 11. Checklist ao Mudar de Domínio

1. Vercel → env var `APP_BASE_URL`
2. Railway → env var `APP_BASE_URL` + **redeploy** (worker usa esta var)
3. Supabase → Auth → URL Configuration → Site URL + Redirect URLs
4. Vapi dashboard → atualizar webhook URL nos assistentes (ou usar botão na página Vapi Config)

---

## 12. Padrões de Código

- **Server Components** para páginas que fazem redirect (auth check)
- **Client Components** (`"use client"`) para tudo com estado/interatividade
- API routes usam sempre `requireTenantAccess(tenantId)` antes de qualquer operação
- Service client (`createServiceClient`) para operações que ignoram RLS
- Não usar `bullmq` no worker — polling simples com `setInterval`/loop
- Tailwind + classes utilitárias inline (sem CSS modules)
- Todos os textos da UI em **português brasileiro**

---

## 13. Pendências / Próximas Features

- [ ] **Analytics Admin Global** — overview de todos os tenants (cards globais, calls-by-day, filtro 7/30/90d)
- [ ] **PR staging → main** — commits desde `34238e1` não foram mergeados ainda
- [ ] **Worker Railway** — verificar se `APP_BASE_URL` está atualizado para `mx3-callx.vercel.app`
