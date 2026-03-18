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
// URL base do app (ex: https://meuapp.vercel.app) — usado para construir o serverUrl do Vapi
// Sem isso, o Vapi usa a URL global do painel, que pode estar errada
const APP_BASE_URL        = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

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
  // serverUrl garante que o end-of-call-report sempre chega no tenant certo,
  // independente do que estiver configurado globalmente no painel do Vapi
  const serverUrl = APP_BASE_URL
    ? `${APP_BASE_URL}/api/webhooks/vapi/${tenantId}`
    : undefined;

  if (serverUrl) {
    console.log(`[worker] serverUrl configurado: ${serverUrl}`);
  } else {
    console.warn(
      "[worker] ⚠ APP_BASE_URL não configurado — Vapi usará a URL global do painel." +
      " Configure APP_BASE_URL nas variáveis de ambiente para garantir recebimento dos webhooks."
    );
  }

  // Monta variableValues de forma defensiva:
  // - Apenas valores primitivos (string, number, boolean)
  // - Exclui nulos, objetos, arrays e strings vazias
  // - Nunca sobrescreve as chaves reservadas phone / phone_e164
  const variableValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(customerData)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue; // array ou objeto aninhado
    const str = String(v).trim();
    if (!str) continue;
    variableValues[k] = str;
  }
  variableValues.phone      = phoneE164;
  variableValues.phone_e164 = phoneE164;

  console.log(
    `[worker] variableValues: ${Object.keys(variableValues).length} campo(s) → [${Object.keys(variableValues).join(", ")}]`
  );

  // Vapi só aceita campos específicos no objeto customer: number, name, extension.
  // Qualquer campo extra (Name, company, email, etc.) causa HTTP 400.
  // Todos os dados do lead chegam ao assistente via variableValues (acima).
  const nameValue = customerData.name ?? customerData.Name ?? customerData.nome ?? null;
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
      assistantOverrides: {
        variableValues,
      },
      ...(serverUrl ? { serverUrl } : {}),
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

  // ── Buscar chave Vapi do tenant ──
  const vapiKey = await getVapiKey(supabase, queue.tenant_id);
  if (!vapiKey) {
    console.warn(`[worker] Tenant ${queue.tenant_id} sem chave Vapi ativa — fila ${queue.name} ignorada`);
    return;
  }

  // ── Processar leads em sequência (um por um para não sobrecarregar a Vapi) ──
  // Intervalo de 1.5s entre chamadas para evitar HTTP 429 (rate limit do Vapi)
  for (const lead of leads) {
    await processLead(supabase, queue, lead, vapiKey);
    await sleep(1_500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de polling
// ─────────────────────────────────────────────────────────────────────────────

async function pollCycle(supabase: SupabaseClient): Promise<void> {
  const { data: queues, error } = await supabase
    .from("dial_queues")
    .select(`
      id, tenant_id, name, assistant_id, phone_number_id, lead_list_id,
      concurrency, max_attempts, retry_delay_minutes,
      allowed_days, allowed_time_window
    `)
    .eq("status", "running");

  if (error) {
    console.error("[worker] Erro ao buscar filas ativas:", error.message);
    return;
  }

  if (!queues || queues.length === 0) return;

  // Processar cada fila (sequencial — evita sobrecarga no Supabase)
  for (const queue of queues as DialQueue[]) {
    try {
      await processQueue(supabase, queue);
    } catch (err) {
      console.error(`[worker] Erro inesperado na fila ${queue.id}:`, err);
    }
  }
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
  console.log(`  Poll interval : ${POLL_INTERVAL_MS}ms`);
  console.log(`  Vapi timeout  : ${VAPI_TIMEOUT_MS}ms`);
  console.log(`  Vapi base URL : ${VAPI_BASE_URL}`);
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
