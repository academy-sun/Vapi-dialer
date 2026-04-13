# Vapi Dialer — MVP Multi-Tenant

Plataforma SaaS de discagem outbound com Vapi, BYO API Key por tenant, importação de CSV, fila BullMQ + Redis e callback PT-BR.

---

## Stack.

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Auth + Postgres + RLS)
- **BullMQ + Redis** (fila de discagem)
- **Vapi** (chamadas outbound)
- **luxon** (timezone America/Sao_Paulo)
- **libphonenumber-js** (normalização E.164)

---

## 1. Configurar Supabase

### Opção A — Supabase Cloud (recomendado para teste)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **Settings → API** e copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

### Opção B — Supabase local (Supabase CLI)

```bash
npx supabase init
npx supabase start
# Copiar as URLs e keys exibidas
```

---

## 2. Aplicar as migrations SQL

No painel Supabase → **SQL Editor**, cole e execute o arquivo:

```
supabase/migrations/001_initial.sql
```

Ou via CLI:

```bash
npx supabase db push
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com os valores do Supabase.

Gerar a chave de criptografia:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado em `ENCRYPTION_KEY_BASE64`.

---

## 4. Rodar localmente

### Desenvolvimento (sem Docker)

```bash
npm install

# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Worker
npm run worker
```

### Com Docker Compose

```bash
docker compose up --build
```

O app ficará disponível em `http://localhost:3000`.

---

## 5. Configurar webhook Vapi por tenant

O Vapi precisa de uma URL pública para enviar eventos. Em desenvolvimento, use [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Copie a URL gerada (ex: `https://abc123.ngrok-free.app`) e defina no `.env`:

```
APP_BASE_URL=https://abc123.ngrok-free.app
```

A URL do webhook por tenant é:

```
https://SEU_DOMINIO/api/webhooks/vapi/{tenantId}
```

Configure esta URL em **Vapi Dashboard → Assistant → Server URL**.

> **Importante:** cada tenant tem sua própria URL com `tenantId` diferente.

---

## 6. Fluxo básico de uso

1. Criar conta em `/signup`
2. Criar um **tenant** (sidebar → "Criar tenant")
3. Configurar **Vapi API Key** em "Configuração Vapi"
4. Criar uma **Lead List** e importar um CSV com coluna `phone`
5. Criar uma **Fila** com Assistant ID + Phone Number ID do Vapi
6. Clicar **Iniciar** na fila
7. O worker começa a discar automaticamente (a cada 2s)
8. Ver chamadas em andamento em "Chamadas"

---

## 7. Testar callback "daqui 2 horas"

### Via webhook simulado (curl)

```bash
TENANT_ID="seu-tenant-id-aqui"

curl -X POST http://localhost:3000/api/webhooks/vapi/$TENANT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": { "id": "vapi-call-test-001" },
      "toolCallList": [
        {
          "id": "tc_001",
          "function": {
            "name": "parse_callback_time",
            "arguments": {
              "text": "daqui 2 horas",
              "timezone": "America/Sao_Paulo"
            }
          }
        }
      ]
    }
  }'
```

Resposta esperada:
```json
{
  "results": [{
    "toolCallId": "tc_001",
    "result": {
      "ok": true,
      "callbackAtIso": "2024-01-15T16:00:00.000Z",
      "confidence": "high",
      "explanation": "Callback em 2h → 14:00 de 15/01 (America/Sao_Paulo)",
      "needsClarification": false,
      "clarificationQuestion": null
    }
  }]
}
```

### Via Vapi (fluxo real)

O assistente Vapi (usando o prompt em `docs/assistant-prompt-ptbr.md`) chama automaticamente `parse_callback_time` quando o lead pede callback, depois `schedule_callback` para agendar.

O worker verifica `next_attempt_at <= now` a cada 2s e recoloca o lead na fila automaticamente no horário certo.

---

## 8. Estrutura do projeto

```
vapi-dialer/
├── src/
│   ├── app/
│   │   ├── (auth)/login/         # Página de login
│   │   ├── (auth)/signup/        # Página de cadastro
│   │   ├── (app)/app/            # Shell autenticado
│   │   │   └── tenants/[tenantId]/
│   │   │       ├── vapi/         # Config Vapi key
│   │   │       ├── leads/        # Lead lists + import CSV
│   │   │       ├── queues/       # Filas + start/pause/stop
│   │   │       └── calls/        # Histórico de chamadas
│   │   └── api/
│   │       ├── tenants/          # CRUD tenants + memberships
│   │       └── webhooks/vapi/    # Webhook por tenant
│   ├── lib/
│   │   ├── supabase/             # browser / server / service clients
│   │   ├── crypto.ts             # AES-256-GCM encrypt/decrypt
│   │   ├── callback-parser.ts    # Parser PT-BR determinístico
│   │   └── auth-helper.ts        # requireTenantAccess()
│   ├── components/
│   │   └── AppShell.tsx          # Layout + tenant selector
│   └── middleware.ts             # Auth guard
├── worker/src/index.ts           # BullMQ worker + scheduler
├── supabase/migrations/          # SQL com RLS
├── docs/
│   ├── assistant-prompt-ptbr.md  # System prompt Vapi
│   └── sample.csv                # CSV de exemplo
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 9. Segurança (o que está implementado vs. o que falta para prod)

| Implementado | Faltaria para prod |
|---|---|
| RLS por tenant_id | Webhook signature verification (Vapi HMAC) |
| AES-256-GCM para Vapi keys | Key rotation |
| Middleware auth guard | Rate limiting nas API routes |
| Service role isolado | Audit log |
| Validação de membership | CSP headers |

---

## 10. Testando isolamento RLS

1. Crie 2 usuários diferentes (User A e User B)
2. Cada um cria seu tenant
3. Logue como User A → só vê os dados do tenant de A
4. Logue como User B → só vê os dados do tenant de B
5. Tente acessar `/api/tenants/{tenant-id-de-A}/leads` estando logado como User B → retorna 403
