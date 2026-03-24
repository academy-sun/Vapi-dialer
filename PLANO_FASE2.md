# Plano Fase 2 — Auditoria Vapi (continuar amanhã)

> Fase 1 concluída em commit da branch `staging`. Este documento cobre o que falta.

---

## Itens Prontos para Implementar (sem bloqueio)

### 2B — Worker: 404 como erro permanente de config → auto-pause da fila

**Problema:** um `assistantId` ou `phoneNumberId` deletado no Vapi faz o worker queimar 100%
das tentativas de todos os leads antes de detectar o problema.

**Dependência:** precisa de migration SQL antes do código.

**Passo 1 — Migration:**
```sql
-- supabase/migrations/015_dial_queues_last_error.sql
ALTER TABLE dial_queues
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
```

**Passo 2 — Worker (`worker/src/index.ts`):**
No bloco `catch (err)` de `processLead`, após o check de `isConcurrencyLimit` e antes do check
de `isProviderFault`, adicionar:

```typescript
// 404 = recurso inexistente na Vapi (assistantId ou phoneNumberId inválido)
// Pause a fila inteira — todos os leads falhariam pelo mesmo motivo
if (httpStatus === 404) {
  console.error(
    `[worker] ✗ Recurso não encontrado na Vapi (HTTP 404) — pausando fila "${queue.name}"` +
    ` | assistantId=${queue.assistant_id} | phoneNumberId=${queue.phone_number_id}`
  );
  // Reverter lead sem contar tentativa
  await supabase.from("leads").update({
    status:        lead.status,
    attempt_count: lead.attempt_count,
    last_outcome:  "config-error-404",
  }).eq("id", lead.id);
  // Pausar fila e registrar motivo
  await supabase.from("dial_queues").update({
    status:     "paused",
    last_error: `Recurso não encontrado no Vapi (404). Verifique se o assistente e número de telefone ainda existem no painel Vapi. assistantId=${queue.assistant_id} | phoneNumberId=${queue.phone_number_id}`,
  }).eq("id", queue.id);
  return;
}
```

**Passo 3 — Frontend (opcional mas recomendado):**
Na página de filas (`/queues`), exibir `last_error` abaixo do nome da fila quando não-null,
com um ícone de alerta amarelo.

**Arquivo:** `src/app/(app)/app/tenants/[tenantId]/queues/`
Buscar onde as filas são listadas e exibir o campo `last_error`.

---

### 2C — Worker: filtro de colisão de número entre listas do mesmo tenant

**Decisão necessária antes de implementar:**
> Tenants com o mesmo número em múltiplas campanhas ativas é um caso de uso válido do produto?

- **Se NÃO:** implementar filtro — impede chamar o mesmo número duas vezes em paralelo.
- **Se SIM:** não implementar, ou tornar configurável por fila.

**Implementação (se decidir implementar):**
Em `processQueue` (`worker/src/index.ts`), após o filtro de limite diário (linha ~658), adicionar:

```typescript
// ── Filtro de colisão de número entre listas do mesmo tenant ─────────────────
// Evita ligar para o mesmo número duas vezes em paralelo (mesmo que em listas diferentes)
const { data: otherCalling } = await supabase
  .from("leads")
  .select("phone_e164")
  .eq("tenant_id", queue.tenant_id)
  .eq("status", "calling")
  .neq("lead_list_id", queue.lead_list_id);

const blockedPhones = new Set((otherCalling ?? []).map((l: { phone_e164: string }) => l.phone_e164));
const beforeFilter = leads.length;
leads = leads.filter((l) => !blockedPhones.has(l.phone_e164));
if (leads.length < beforeFilter) {
  console.log(
    `[worker] Fila="${queue.name}" | ${beforeFilter - leads.length} lead(s) bloqueados (` +
    `mesmo número em outra lista em andamento)`
  );
}
// ─────────────────────────────────────────────────────────────────────────────
```

---

### 4A — Script: reconciliar 12 call_records com ended_reason = NULL

**O que é:** 12 webhooks que nunca chegaram. A API da Vapi tem endpoint para recuperar os dados.

**Como criar:**
1. Criar arquivo `scripts/reconcile-null-webhooks.ts`
2. Adicionar ao `package.json`: `"reconcile": "tsx scripts/reconcile-null-webhooks.ts"`

**Conteúdo do script:**

```typescript
// scripts/reconcile-null-webhooks.ts
// Execução: npm run reconcile
// Requer as mesmas variáveis de ambiente do worker

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL         = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY_B64   = process.env.ENCRYPTION_KEY_BASE64!;
const VAPI_BASE_URL        = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

function decryptAesGcm(cipherText: string): string {
  const key     = Buffer.from(ENCRYPTION_KEY_B64, "base64");
  const payload = JSON.parse(Buffer.from(cipherText, "base64").toString("utf8"));
  const iv      = Buffer.from(payload.iv,   "base64");
  const tag     = Buffer.from(payload.tag,  "base64");
  const data    = Buffer.from(payload.data, "base64");
  const dec     = crypto.createDecipheriv("aes-256-gcm", key, iv) as crypto.DecipherGCM;
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Buscar call_records com ended_reason NULL e vapi_call_id preenchido
  const { data: records } = await supabase
    .from("call_records")
    .select("id, vapi_call_id, tenant_id, lead_id")
    .is("ended_reason", null)
    .not("vapi_call_id", "is", null);

  if (!records?.length) {
    console.log("Nenhum registro pendente.");
    return;
  }
  console.log(`Processando ${records.length} registros com ended_reason=NULL...`);

  for (const rec of records) {
    // Buscar chave Vapi do tenant
    const { data: conn } = await supabase
      .from("vapi_connections")
      .select("encrypted_private_key")
      .eq("tenant_id", rec.tenant_id)
      .eq("is_active", true)
      .single();

    if (!conn) { console.warn(`  [${rec.vapi_call_id}] Sem conexão Vapi para tenant ${rec.tenant_id}`); continue; }

    let vapiKey: string;
    try { vapiKey = decryptAesGcm(conn.encrypted_private_key); }
    catch { console.warn(`  [${rec.vapi_call_id}] Falha ao descriptografar chave`); continue; }

    // 2. Consultar Vapi pelo callId
    const res = await fetch(`${VAPI_BASE_URL}/call/${rec.vapi_call_id}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });

    if (!res.ok) {
      console.warn(`  [${rec.vapi_call_id}] Vapi retornou ${res.status}`);
      continue;
    }

    const call = await res.json() as Record<string, unknown>;
    const endedReason    = call.endedReason    as string | null ?? null;
    const cost           = call.cost           as number | null ?? null;
    const durationSeconds = call.durationSeconds as number | null ?? null;
    const transcript     = (call.artifact as Record<string, unknown> | undefined)?.transcript as string | null ?? null;

    if (!endedReason) {
      console.warn(`  [${rec.vapi_call_id}] Vapi ainda não tem endedReason — call status=${call.status}`);
      continue;
    }

    // 3. Atualizar call_record
    await supabase.from("call_records").update({
      ended_reason:     endedReason,
      cost,
      duration_seconds: durationSeconds,
      transcript,
    }).eq("id", rec.id);

    console.log(`  ✓ [${rec.vapi_call_id}] endedReason="${endedReason}" atualizado`);
  }

  console.log("Concluído.");
}

main().catch(console.error);
```

**Como executar:**
```bash
# Na raiz do projeto, com .env.local preenchido:
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ENCRYPTION_KEY_BASE64=... npx tsx scripts/reconcile-null-webhooks.ts
```

---

## Itens Mais Invasivos (Fase 3 — separado)

### 3 — Recovery com verificação na API Vapi antes de resetar

**O que é:** antes de resetar um lead preso em `calling` há 30min, consultar `GET /call/{vapi_call_id}`
para confirmar se a chamada realmente encerrou.

**Por que é complexo:**
- O `vapi_call_id` está em `call_records`, não em `leads` — precisa de JOIN
- Adiciona N chamadas HTTP ao recovery (1 por lead preso)
- A função `recoverStaleCalls` precisaria de refactor significativo

**Esboço da lógica:**
```typescript
// 1. JOIN leads com call_records para pegar vapi_call_id mais recente
// 2. Para cada lead stale:
//    - GET https://api.vapi.ai/call/{vapi_call_id} com chave do tenant
//    - Se status = "in-progress": atualizar last_attempt_at, NÃO resetar
//    - Se status = "ended": processar igual ao webhook (chamar updateLeadAfterCall)
//    - Se 404 ou erro de rede: resetar normalmente (fallback)
//    - Se sem vapi_call_id: resetar imediatamente
```

**Quando implementar:** quando o volume de leads presos em `calling` (>30min) for recorrente
e causar problemas reais de duplicação de chamadas para clientes já atendidos.

---

### 5A — Configurar WORKER_INDEX/WORKER_COUNT no Railway

**Isso deve ser feito AGORA no Railway (não é código — é configuração):**

| Serviço    | Variável       | Valor |
|-----------|---------------|-------|
| Worker 1  | `WORKER_INDEX` | `0`   |
| Worker 1  | `WORKER_COUNT` | `2`   |
| Worker 2  | `WORKER_INDEX` | `1`   |
| Worker 2  | `WORKER_COUNT` | `2`   |

Sem isso, ambos os workers processam os mesmos tenants e somam chamadas acima do limite.

---

### 5B — Campos adicionais em call_records

**Adicionar (pequenos, úteis para analytics e auditoria):**
```sql
-- supabase/migrations/016_call_records_timing.sql
ALTER TABLE call_records
  ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS ended_at        TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cost_breakdown  JSONB NULL;
```

**NÃO adicionar `messages` por enquanto** — pode ter 50-200KB por registro.

No webhook handler (`route.ts`), após criar/atualizar `call_records`, extrair:
```typescript
const startedAt      = (message.startedAt  ?? null) as string | null;
const endedAt        = (message.endedAt    ?? null) as string | null;
const costBreakdown  = (message.costBreakdown ?? null) as Record<string, unknown> | null;
// Adicionar ao INSERT/UPDATE do call_record
```

---

### 5C — Validação prévia de config no start da fila

**Onde:** `src/app/api/tenants/[tenantId]/queues/[queueId]/start/route.ts`

**O que fazer:** antes de mudar status para `'running'`, chamar:
- `GET https://api.vapi.ai/assistant/{assistantId}` → se 404: retornar erro, não ativar fila
- `GET https://api.vapi.ai/phone-number/{phoneNumberId}` → idem

**Dependência natural com 2B** — ambos protegem contra config inválida (2B na execução, 5C na ativação).

---

## Resumo de Prioridades

| Item | Complexidade | Bloqueia algo? | Quando fazer |
|------|-------------|---------------|-------------|
| **5A Railway config** | Config apenas | Sim — 2 workers sem isolamento causam Over Concurrency | **HOJE no Railway** |
| **2B (404 + pause)** | Media | Não | Próxima sessão |
| **2C (colisão número)** | Baixa | Depende de decisão | Próxima sessão (após decidir) |
| **4A (script reconciliação)** | Baixa | Não | Próxima sessão |
| **5B (campos timing)** | Baixa | Não | Próxima sessão |
| **3 (recovery Vapi)** | Alta | Não (urgente apenas se duplicações ocorrerem) | Fase 3 |
| **5C (validação start)** | Media | Não | Fase 3 (junto com 2B) |
