/**
 * Vapi Dialer — Worker
 *
 * Processo de background responsável por:
 *  1. Varrer filas ativas (dial_queues status='running')
 *  2. Respeitar janela de horário permitida (allowed_days + allowed_time_window)
 *  3. Respeitar concorrência por fila
 *  4. Disparar chamadas via API da Vapi
 *  5. Criar call_records e atualizar status dos leads atomicamente
 *  6. Reagendar leads com falha de API (backoff + max_attempts)
 *
 * Roda em loop contínuo com intervalo configurável (POLL_INTERVAL_MS).
 * Um único processo — sem concorrência entre workers.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import axios, { AxiosError } from "axios";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────────────

// Aceita NEXT_PUBLIC_SUPABASE_URL (padrão do Next.js) OU SUPABASE_URL (Railway/backend puro)
const SUPABASE_URL        = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY_B64  = process.env.ENCRYPTION_KEY_BASE64!;
const POLL_INTERVAL_MS    = Number(process.env.POLL_INTERVAL_MS   ?? 5_000);
const VAPI_TIMEOUT_MS     = Number(process.env.VAPI_TIMEOUT_MS    ?? 15_000);
const VAPI_BASE_URL       = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";
// Delay entre cada disparo de chamada dentro de um ciclo (evita 503/408 do provedor SIP)
const DISPATCH_DELAY_MS   = Number(process.env.DISPATCH_DELAY_MS  ?? 3_000);
// URL base do app (ex: https://meuapp.vercel.app) — usado para construir o serverUrl do Vapi
// Sem isso, o Vapi usa a URL global do painel, que pode estar errada
const APP_BASE_URL        = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
// ── Distribuição automática de tenants entre workers ──────────────────────────
// Cada worker recebe um índice (0-based) e o total de workers.
// Ex: 4 workers → Worker 0 pega tenants 0,4,8…  Worker 1 pega 1,5,9… etc.
// Novo tenant é distribuído automaticamente — sem atualizar variáveis manuais.
//
// Railway: definir em cada serviço:
//   WORKER_INDEX=0  WORKER_COUNT=4
//   WORKER_INDEX=1  WORKER_COUNT=4  … etc.
//
// Se WORKER_COUNT não estiver definido (ou = 1), o worker processa tudo.
const WORKER_INDEX = Number(process.env.WORKER_INDEX ?? 0);
const WORKER_COUNT = Number(process.env.WORKER_COUNT ?? 1);

// Fallback manual: lista de tenant IDs separados por vírgula.
// Só usado se WORKER_COUNT <= 1 E TENANT_ID_FILTER estiver definido.
// Mantido para compatibilidade — preferir WORKER_INDEX/WORKER_COUNT.
const TENANT_ID_FILTER: string[] = (process.env.TENANT_ID_FILTER ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Retorna os tenant IDs que este worker deve processar.
// Busca todos os tenants do Supabase, ordena por id (estável),
// e retorna os que caem no slot deste worker (index % count).
async function resolveMyTenants(supabase: SupabaseClient): Promise<string[] | null> {
  // Modo manual explícito (legado)
  if (WORKER_COUNT <= 1 && TENANT_ID_FILTER.length > 0) {
    return TENANT_ID_FILTER;
  }
  // Modo único worker sem filtro — processa tudo
  if (WORKER_COUNT <= 1) {
    return null; // null = sem filtro
  }
  // Modo auto-distribuição
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .order("id", { ascending: true });
  if (error || !data) {
    console.error("[worker] Erro ao buscar tenants para distribuição:", error?.message);
    return null;
  }
  const mine = data
    .map((t: { id: string }) => t.id)
    .filter((_: string, i: number) => i % WORKER_COUNT === WORKER_INDEX);
  return mine;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface TimeWindow {
  start: string;    // "HH:MM"
  end:   string;    // "HH:MM"
  timezone: string; // "America/Sao_Paulo"
}

interface DialQueue {
  id:                   string;
  tenant_id:            string;
  name:                 string;
  assistant_id:         string;
  phone_number_id:      string;
  lead_list_id:         string;
  concurrency:          number;
  max_attempts:         number;
  retry_delay_minutes:  number;
  allowed_days:         number[];    // ISO weekday: 1=Seg … 7=Dom
  allowed_time_window:  TimeWindow;
}

interface Lead {
  id:            string;
  phone_e164:    string;
  data_json:     Record<string, unknown>;
  status:        string;
  attempt_count: number;
}

interface VapiCallResponse {
  id:     string;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache de chaves Vapi (evita descriptografar a cada ciclo)
// ─────────────────────────────────────────────────────────────────────────────

const vapiKeyCache = new Map<string, { key: string; expiresAt: number }>();
const KEY_CACHE_TTL_MS = 60_000; // 1 min

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

async function getVapiKey(supabase: SupabaseClient, tenantId: string): Promise<string | null> {
  const cached = vapiKeyCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const { data } = await supabase
    .from("vapi_connections")
    .select("encrypted_private_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  try {
    const key = decryptAesGcm(data.encrypted_private_key);
    vapiKeyCache.set(tenantId, { key, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
    return key;
  } catch {
    console.error(`[worker] Falha ao descriptografar chave do tenant ${tenantId}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de janela horária
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

function isWithinTimeWindow(
  allowedDays: number[] | null | undefined,
  window: TimeWindow | null | undefined
): boolean {
  // Se não configurado (lista vazia ou null) → sem restrição → sempre permitido
  if (!allowedDays || allowedDays.length === 0) return true;
  if (!window?.start || !window?.end || !window?.timezone)   return true;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: window.timezone,
    weekday: "short",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  false,
  });

  const parts      = formatter.formatToParts(new Date());
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr    = parts.find((p) => p.type === "hour")?.value   ?? "0";
  const minStr     = parts.find((p) => p.type === "minute")?.value ?? "0";

  const isoDay = WEEKDAY_MAP[weekdayStr] ?? 1;
  if (!allowedDays.includes(isoDay)) {
    console.log(
      `[worker] Fora do dia permitido (hoje=${isoDay}, permitidos=[${allowedDays.join(",")}])`
    );
    return false;
  }

  const [startH, startM] = window.start.split(":").map(Number);
  const [endH,   endM  ] = window.end.split(":").map(Number);

  const nowMin   = parseInt(hourStr) * 60 + parseInt(minStr);
  const startMin = startH * 60 + startM;
  const endMin   = endH   * 60 + endM;

  if (nowMin < startMin || nowMin >= endMin) {
    console.log(
      `[worker] Fora do horário permitido (agora=${hourStr}:${minStr}, janela=${window.start}-${window.end} ${window.timezone})`
    );
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chamada Vapi
// ─────────────────────────────────────────────────────────────────────────────

async function initiateVapiCall(
  apiKey:        string,
  assistantId:   string,
  phoneNumberId: string,
  phoneE164:     string,
  customerData:  Record<string, unknown>,
  tenantId:      string,
): Promise<VapiCallResponse> {
  // Nota: o Vapi não aceita serverUrl nem server.url no payload do /call/phone.
  // O webhook de end-of-call-report deve ser configurado no painel do Vapi
  // em: Dashboard → Settings → Server URL → https://<app>/api/webhooks/vapi/<tenantId>
  if (APP_BASE_URL) {
    console.log(
      `[worker] ⚠ Configure o Server URL no painel do Vapi: ` +
      `${APP_BASE_URL}/api/webhooks/vapi/${tenantId}`
    );
  }

  // variableValues: somente primitivos não-vazios
  const variableValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(customerData)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue;
    const str = String(v).trim();
    if (!str) continue;
    variableValues[k] = str;
  }
  variableValues.phone      = phoneE164;
  variableValues.phone_e164 = phoneE164;

  // customer: apenas campos aceitos pelo Vapi (number, name, extension)
  const nameValue =
    customerData.name ??
    customerData.Name ??
    customerData.nome ??
    customerData.first_name ??
    customerData.primeiro_nome ??
    null;
  const customerPayload: Record<string, unknown> = {
    number: phoneE164,
    ...(nameValue ? { name: String(nameValue) } : {}),
  };

  const { data } = await axios.post<VapiCallResponse>(
    `${VAPI_BASE_URL}/call/phone`,
    {
      assistantId,
      phoneNumberId,
      customer: customerPayload,
      assistantOverrides: { variableValues },
    },
    {
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: VAPI_TIMEOUT_MS,
    },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar lead individual
// ─────────────────────────────────────────────────────────────────────────────

async function processLead(
  supabase: SupabaseClient,
  queue:    DialQueue,
  lead:     Lead,
  vapiKey:  string,
): Promise<void> {
  const now             = new Date().toISOString();
  const newAttemptCount = lead.attempt_count + 1;

  // ── 1. Claim atômico: só atualiza se o status ainda for o esperado ──
  const { data: claimed } = await supabase
    .from("leads")
    .update({
      status:          "calling",
      attempt_count:   newAttemptCount,
      last_attempt_at: now,
    })
    .eq("id",     lead.id)
    .eq("status", lead.status) // lock otimista
    .select("id")
    .single();

  if (!claimed) {
    // Lead já foi processado por outro ciclo (não deve acontecer com 1 worker)
    return;
  }

  // ── 2. Chamar a API da Vapi ──
  try {
    const vapiCall = await initiateVapiCall(
      vapiKey,
      queue.assistant_id,
      queue.phone_number_id,
      lead.phone_e164,
      lead.data_json ?? {},
      queue.tenant_id,
    );

    // ── 3. Criar call_record ──
    const { error: insertErr } = await supabase.from("call_records").insert({
      tenant_id:    queue.tenant_id,
      dial_queue_id: queue.id,
      lead_id:      lead.id,
      vapi_call_id: vapiCall.id,
      status:       vapiCall.status ?? "in-progress",
    });

    if (insertErr) {
      console.error(`[worker] Erro ao criar call_record para lead ${lead.id}:`, insertErr.message);
    }

    console.log(
      `[worker] ✓ Chamada iniciada | tenant=${queue.tenant_id} | lead=${lead.id}` +
      ` | phone=${lead.phone_e164} | vapi_call=${vapiCall.id}`,
    );
  } catch (err) {
    // ── 4. Falha na API Vapi → reagendar ou marcar como falha ──
    const isRateLimit = err instanceof AxiosError && err.response?.status === 429;
    const httpStatus  = err instanceof AxiosError ? err.response?.status : null;
    const errorBody   = err instanceof AxiosError ? JSON.stringify(err.response?.data) : null;
    const errorLabel  = err instanceof AxiosError
      ? `HTTP ${httpStatus}: ${errorBody}`
      : String(err);

    console.error(
      `[worker] ✗ Falha ao ligar para ${lead.phone_e164}` +
      ` | tentativa ${newAttemptCount}/${queue.max_attempts}` +
      ` | fila=${queue.name} | tenant=${queue.tenant_id}` +
      ` | erro: ${errorLabel}`,
    );

    // Log extra para erros de validação do Vapi (422 / 400) — indica payload inválido
    if (httpStatus === 422 || httpStatus === 400) {
      console.error(
        `[worker] ⚠ Payload rejeitado pelo Vapi (HTTP ${httpStatus}) — verifique assistantId, phoneNumberId e variableValues` +
        ` | assistantId=${queue.assistant_id} | phoneNumberId=${queue.phone_number_id}` +
        ` | resposta Vapi: ${errorBody}`
      );
    }

    // ── Erros de provedor SIP (503 / 408) ── reagendar com delay, mas com cap de tentativas
    // O attempt_count JÁ foi incrementado no "claim" atômico acima (step 1).
    // Portanto precisamos verificar max_attempts mesmo aqui para evitar loop infinito.
    const isProviderFault = httpStatus === 503 || httpStatus === 408;
    if (isProviderFault) {
      if (newAttemptCount >= queue.max_attempts) {
        // Atingiu o limite mesmo com erros de provedor — marcar como failed para não lopar
        console.warn(
          `[worker] ✗ Lead ${lead.id} atingiu max_attempts (${queue.max_attempts}) por erros de provedor ` +
          `(HTTP ${httpStatus}) — marcando como failed`
        );
        await supabase
          .from("leads")
          .update({
            status:        "failed",
            attempt_count: newAttemptCount,
            last_outcome:  `provider-fault-limit-${httpStatus}`,
          })
          .eq("id", lead.id);
        return;
      }

      const nextAt = new Date(Date.now() + 60_000).toISOString();
      console.warn(
        `[worker] ⚠ Provedor SIP indisponível (HTTP ${httpStatus}) — ` +
        `reagendando lead ${lead.id} em 60s (tentativa ${newAttemptCount}/${queue.max_attempts})`
      );
      await supabase
        .from("leads")
        .update({
          status:          "queued",
          next_attempt_at: nextAt,
          last_outcome:    `provider-${httpStatus}`,
        })
        .eq("id", lead.id);
      return;
    }

    if (newAttemptCount < queue.max_attempts) {
      // Ainda tem tentativas — reagendar com delay
      const delayMin = isRateLimit ? queue.retry_delay_minutes * 2 : queue.retry_delay_minutes;
      const nextAt   = new Date(Date.now() + delayMin * 60_000).toISOString();

      await supabase
        .from("leads")
        .update({
          status:          "queued",   // volta para fila (não "failed")
          attempt_count:   newAttemptCount,
          next_attempt_at: nextAt,
          last_outcome:    "api-error",
        })
        .eq("id", lead.id);
    } else {
      // Esgotou tentativas
      await supabase
        .from("leads")
        .update({
          status:        "failed",
          attempt_count: newAttemptCount,
          last_outcome:  "api-error",
        })
        .eq("id", lead.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar fila
// ─────────────────────────────────────────────────────────────────────────────

async function processQueue(supabase: SupabaseClient, queue: DialQueue): Promise<void> {
  // ── Verificar janela de horário ──
  // allowed_days vem como JSONB do Supabase; garantir array numérico antes de verificar
  const allowedDays = Array.isArray(queue.allowed_days) ? (queue.allowed_days as unknown as number[]) : [];
  if (!isWithinTimeWindow(allowedDays, queue.allowed_time_window)) return;

  // ── Contar chamadas ativas (status='calling') para esta fila ──
  const { count: activeCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id",    queue.tenant_id)
    .eq("lead_list_id", queue.lead_list_id)
    .eq("status",       "calling");

  const slots = queue.concurrency - (activeCount ?? 0);
  if (slots <= 0) return; // Concorrência máxima atingida

  const now = new Date().toISOString();

  // ── Prioridade 1: callbacks agendados e leads com retry vencido ──
  const { data: priorityLeads } = await supabase
    .from("leads")
    .select("id, phone_e164, data_json, status, attempt_count")
    .eq("tenant_id",    queue.tenant_id)
    .eq("lead_list_id", queue.lead_list_id)
    .eq("status",       "callbackScheduled")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(slots);

  // ── Prioridade 2: leads novos na fila ──
  const remainingSlots = slots - (priorityLeads?.length ?? 0);
  const freshLeads = remainingSlots > 0
    ? (await supabase
        .from("leads")
        .select("id, phone_e164, data_json, status, attempt_count")
        .eq("tenant_id",    queue.tenant_id)
        .eq("lead_list_id", queue.lead_list_id)
        .eq("status",       "queued")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
        .order("next_attempt_at", { ascending: true, nullsFirst: true })
        .limit(remainingSlots)
      ).data
    : [];

  const leads: Lead[] = [
    ...(priorityLeads ?? []),
    ...(freshLeads    ?? []),
  ] as Lead[];

  if (leads.length === 0) return;

  console.log(
    `[worker] Fila="${queue.name}" (${queue.id}) | lista=${queue.lead_list_id} | ` +
    `slots=${slots} | leads selecionados: [${leads.map(l => l.phone_e164).join(", ")}]`
  );

  // ── Buscar chave Vapi do tenant ──
  const vapiKey = await getVapiKey(supabase, queue.tenant_id);
  if (!vapiKey) {
    console.warn(`[worker] Tenant ${queue.tenant_id} sem chave Vapi ativa — fila ${queue.name} ignorada`);
    return;
  }

  // ── Processar leads em sequência (um por um para não sobrecarregar a Vapi/SIP) ──
  // DISPATCH_DELAY_MS entre chamadas: evita HTTP 429 (Vapi rate limit) e 503/408 (SIP overload)
  for (const lead of leads) {
    await processLead(supabase, queue, lead, vapiKey);
    await sleep(DISPATCH_DELAY_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery: libera leads travados em "calling" há mais de STALE_CALLING_MINUTES
// ─────────────────────────────────────────────────────────────────────────────

const STALE_CALLING_MINUTES = Number(process.env.STALE_CALLING_MINUTES ?? 30);

async function recoverStaleCalls(supabase: SupabaseClient): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_CALLING_MINUTES * 60 * 1000).toISOString();

  // 1. Buscar leads presos em "calling" há mais de STALE_CALLING_MINUTES
  //    Usa last_attempt_at como proxy: o worker seta status="calling" e last_attempt_at ao mesmo tempo
  //    NOTA: updated_at não existe na tabela leads — o campo correto é last_attempt_at
  // Respeitar isolamento por tenant no recovery
  const myTenants = await resolveMyTenants(supabase);

  let staleQuery = supabase
    .from("leads")
    .select("id, phone_e164, lead_list_id, tenant_id")
    .eq("status", "calling")
    .not("last_attempt_at", "is", null)
    .lt("last_attempt_at", staleThreshold);

  if (myTenants !== null) {
    if (myTenants.length === 0) return;
    staleQuery = staleQuery.in("tenant_id", myTenants);
  }

  const { data: stale, error } = await staleQuery;

  if (error) {
    console.error("[worker] recoverStaleCalls: erro ao buscar leads presos:", error.message);
    return;
  }
  if (!stale || stale.length === 0) return;

  // 2. Verificar quais lead_lists têm fila RUNNING ou PAUSED
  //    Leads de filas STOPPED não devem ser resetados para "queued" —
  //    a fila foi encerrada intencionalmente; resetar causaria chamadas
  //    indesejadas se a fila for reiniciada.
  const listIds = [...new Set(stale.map((l: { lead_list_id: string }) => l.lead_list_id))];

  const { data: activeLists, error: queueErr } = await supabase
    .from("dial_queues")
    .select("lead_list_id, status")
    .in("lead_list_id", listIds)
    .in("status", ["running", "paused"]);

  if (queueErr) {
    console.error("[worker] recoverStaleCalls: erro ao checar filas:", queueErr.message);
    return;
  }

  const recoverableListIds = new Set(
    (activeLists ?? []).map((q: { lead_list_id: string }) => q.lead_list_id)
  );

  // 3. Filtrar apenas leads cujas filas estão ativas ou pausadas
  const recoverableIds = stale
    .filter((l: { id: string; lead_list_id: string }) => recoverableListIds.has(l.lead_list_id))
    .map((l: { id: string }) => l.id);

  const skippedCount = stale.length - recoverableIds.length;
  if (skippedCount > 0) {
    console.log(
      `[worker] recoverStaleCalls: ${skippedCount} lead(s) ignorados (fila stopped/inexistente)`
    );
  }

  if (recoverableIds.length === 0) return;

  console.warn(
    `[worker] ⚠ ${recoverableIds.length} lead(s) presos em "calling" há >${STALE_CALLING_MINUTES}min — resetando para "queued"`
  );

  const retryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // retry em 2 min

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status:          "queued",
      last_outcome:    "stale-calling-reset",
      next_attempt_at: retryAt,
    })
    .in("id", recoverableIds);

  if (updateError) {
    console.error("[worker] recoverStaleCalls: erro ao resetar leads:", updateError.message);
  } else {
    console.log(`[worker] ✓ ${recoverableIds.length} lead(s) resetados para "queued"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de polling
// ─────────────────────────────────────────────────────────────────────────────

async function pollCycle(supabase: SupabaseClient): Promise<void> {
  // Resolver quais tenants este worker processa neste ciclo
  const myTenants = await resolveMyTenants(supabase);

  let queueQuery = supabase
    .from("dial_queues")
    .select(`
      id, tenant_id, name, assistant_id, phone_number_id, lead_list_id,
      concurrency, max_attempts, retry_delay_minutes,
      allowed_days, allowed_time_window
    `)
    .eq("status", "running");

  if (myTenants !== null) {
    if (myTenants.length === 0) return; // este worker não tem tenants ainda
    queueQuery = queueQuery.in("tenant_id", myTenants);
  }

  const { data: queues, error } = await queueQuery;

  if (error) {
    console.error("[worker] Erro ao buscar filas ativas:", error.message);
    return;
  }

  if (!queues || queues.length === 0) return;

  // Processar todas as filas em paralelo — múltiplas campanhas rodam simultaneamente
  await Promise.all(
    (queues as DialQueue[]).map((queue) =>
      processQueue(supabase, queue).catch((err) =>
        console.error(`[worker] Erro inesperado na fila ${queue.id}:`, err)
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Vapi Dialer — Worker iniciando");
  console.log(`  Poll interval  : ${POLL_INTERVAL_MS}ms`);
  console.log(`  Vapi timeout   : ${VAPI_TIMEOUT_MS}ms`);
  console.log(`  Vapi base URL  : ${VAPI_BASE_URL}`);
  console.log(`  Dispatch delay : ${DISPATCH_DELAY_MS}ms (entre chamadas)`);
  if (WORKER_COUNT > 1) {
    console.log(`  Modo worker    : ${WORKER_INDEX + 1} de ${WORKER_COUNT} (auto-distribuição por índice)`);
  } else if (TENANT_ID_FILTER.length > 0) {
    console.log(`  Tenant filter  : ${TENANT_ID_FILTER.join(", ")} (${TENANT_ID_FILTER.length} tenant(s)) [modo legado]`);
  } else {
    console.log("  Modo worker    : único — processa TODOS os tenants");
  }
  console.log("═══════════════════════════════════════════════════");

  // Validar variáveis obrigatórias
  const missing: string[] = [];
  if (!SUPABASE_URL)         missing.push("SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)");
  if (!SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ENCRYPTION_KEY_B64)   missing.push("ENCRYPTION_KEY_BASE64");

  if (missing.length > 0) {
    console.error("[worker] ✗ Variáveis de ambiente obrigatórias ausentes:");
    missing.forEach((v) => console.error(`    - ${v}`));
    console.error("[worker]   Configure essas variáveis no painel do Railway → Variables.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Testar conexão
  const { error: pingErr } = await supabase.from("tenants").select("id").limit(1);
  if (pingErr) {
    console.error("[worker] ✗ Falha ao conectar ao Supabase:", pingErr.message);
    process.exit(1);
  }
  console.log("[worker] ✓ Conexão com Supabase OK");

  // Graceful shutdown
  let running = true;
  const shutdown = (signal: string) => {
    console.log(`[worker] ${signal} recebido — encerrando após o ciclo atual...`);
    running = false;
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  // Frequência do recovery de stale calls: a cada ~60s (independente do POLL_INTERVAL_MS)
  const STALE_RECOVERY_EVERY_N_CYCLES = Math.max(1, Math.round(60_000 / POLL_INTERVAL_MS));

  // Loop principal
  let cycleCount = 0;
  while (running) {
    const start = Date.now();
    cycleCount++;

    try {
      await pollCycle(supabase);
    } catch (err) {
      console.error(`[worker] Erro no ciclo #${cycleCount}:`, err);
    }

    // Recovery periódico de leads presos em "calling"
    if (cycleCount % STALE_RECOVERY_EVERY_N_CYCLES === 0) {
      try {
        await recoverStaleCalls(supabase);
      } catch (err) {
        console.error("[worker] Erro no recoverStaleCalls:", err);
      }
    }

    // Heartbeat simples no console a cada ~5 minutos (para monitoramento de logs)
    if (cycleCount % Math.max(1, Math.round(300_000 / POLL_INTERVAL_MS)) === 0) {
      console.log(`[worker] ♥ heartbeat | ciclo #${cycleCount} | ${new Date().toISOString()}`);
    }

    const elapsed = Date.now() - start;
    const wait    = Math.max(0, POLL_INTERVAL_MS - elapsed);

    if (running) await sleep(wait);
  }

  console.log("[worker] Worker encerrado com sucesso.");
}

main().catch((err) => {
  console.error("[worker] Erro fatal:", err);
  process.exit(1);
});
