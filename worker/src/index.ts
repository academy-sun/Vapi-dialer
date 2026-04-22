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
const POLL_INTERVAL_MS    = Number(process.env.POLL_INTERVAL_MS   ?? 15_000);
const VAPI_TIMEOUT_MS     = Number(process.env.VAPI_TIMEOUT_MS    ?? 15_000);
const VAPI_BASE_URL       = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";
// Delay entre cada disparo de chamada dentro de um ciclo (evita 503/408 do provedor SIP)
const DISPATCH_DELAY_MS   = Number(process.env.DISPATCH_DELAY_MS  ?? 5_000);
// Bypass de horário para testes — NUNCA ativar em produção
const BYPASS_TIME_WINDOW  = process.env.BYPASS_TIME_WINDOW === "true";
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
// Cache de nomes de tenants — substitui UUIDs nos logs por nomes legíveis
// ─────────────────────────────────────────────────────────────────────────────

const tenantNameCache = new Map<string, string>();

/** Retorna o nome do tenant para logs, ou o UUID se ainda não estiver no cache. */
function tName(id: string): string {
  return tenantNameCache.get(id) ?? id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown de concorrência por tenant (em memória)
// Quando Vapi retorna "Over Concurrency Limit", bloqueamos o tenant por
// CONCURRENCY_COOLDOWN_MS para evitar o loop de tentativas repetidas enquanto
// os slots continuam ocupados. O cooldown expira automaticamente.
// ─────────────────────────────────────────────────────────────────────────────
const CONCURRENCY_COOLDOWN_MS = 60_000; // 60 segundos
const tenantConcurrencyCooldown = new Map<string, number>(); // tenantId → unblockAt (epoch ms)

function setTenantConcurrencyCooldown(tenantId: string): void {
  tenantConcurrencyCooldown.set(tenantId, Date.now() + CONCURRENCY_COOLDOWN_MS);
}

function isTenantInConcurrencyCooldown(tenantId: string): boolean {
  const unblockAt = tenantConcurrencyCooldown.get(tenantId);
  if (!unblockAt) return false;
  if (Date.now() >= unblockAt) {
    tenantConcurrencyCooldown.delete(tenantId); // expirou — limpar
    return false;
  }
  return true;
}

async function refreshTenantNames(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.from("tenants").select("id, name");
  if (data) data.forEach((t: { id: string; name: string }) => tenantNameCache.set(t.id, t.name));
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
  max_daily_attempts:   number;      // 1–10 tentativas por lead por dia
  allowed_days:         number[];    // ISO weekday: 1=Seg … 7=Dom
  allowed_time_window:  TimeWindow;
  last_error:           string | null; // circuit breaker: JSON com circuit_open_until
}

interface Lead {
  id:            string;
  phone_e164:    string;
  data_json:     Record<string, unknown>;
  status:        string;
  attempt_count: number;
}

interface VapiCallResponse {
  id:                        string;
  status:                    string;
  concurrencyLimit?:          number;
  remainingConcurrentCalls?:  number;
  concurrencyBlocked?:        boolean;
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
// Verificação de janela horária + agendamento com jitter
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/**
 * Verifica se um Date específico está dentro da janela (dia + horário).
 * Diferente de isWithinTimeWindow que verifica "agora".
 */
function isWithinWindowAt(dt: Date, allowedDays: number[], tw: TimeWindow): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tw.timezone, weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts      = fmt.formatToParts(dt);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const isoDay     = WEEKDAY_MAP[weekdayStr] ?? 1;
  if (!allowedDays.includes(isoDay)) return false;

  const [startH, startM] = tw.start.split(":").map(Number);
  const [endH,   endM  ] = tw.end.split(":").map(Number);
  const dtMin    = parseInt(parts.find((p) => p.type === "hour")!.value)   * 60
                 + parseInt(parts.find((p) => p.type === "minute")!.value);
  return dtMin >= startH * 60 + startM && dtMin < endH * 60 + endM;
}

/**
 * Retorna um Date representando tw.start no próximo dia permitido após `from`.
 * DST-safe: usa Intl para converter local → UTC.
 */
function nextWindowStart(from: Date, allowedDays: number[], tw: TimeWindow): Date {
  const wdFmt   = new Intl.DateTimeFormat("en-US",  { timeZone: tw.timezone, weekday: "short" });
  const dateFmt = new Intl.DateTimeFormat("sv-SE",  { timeZone: tw.timezone, dateStyle: "short" }); // "YYYY-MM-DD"
  const hFmt    = new Intl.DateTimeFormat("en-US",  { timeZone: tw.timezone, hour: "2-digit", hour12: false });
  const mFmt    = new Intl.DateTimeFormat("en-US",  { timeZone: tw.timezone, minute: "2-digit" });
  const [startH, startM] = tw.start.split(":").map(Number);

  for (let d = 1; d <= 14; d++) {
    const candidate = new Date(from.getTime() + d * 86_400_000);
    const isoDay    = WEEKDAY_MAP[wdFmt.format(candidate)] ?? 1;
    if (!allowedDays.includes(isoDay)) continue;

    // Aproximar: tratar start como UTC e corrigir pelo offset real do timezone
    const approx = new Date(`${dateFmt.format(candidate)}T${tw.start}:00Z`);
    const diffMs = ((startH * 60 + startM) - (parseInt(hFmt.format(approx)) * 60 + parseInt(mFmt.format(approx)))) * 60_000;
    return new Date(approx.getTime() + diffMs);
  }

  return new Date(from.getTime() + 86_400_000); // fallback
}

/**
 * Calcula next_attempt_at com jitter para evitar engargalamento no início da janela.
 *
 * Se baseTime + delayMin cair dentro da janela → retorna esse horário (sem jitter).
 * Se cair fora → ajusta para time_start do próximo dia permitido +
 *                offset aleatório em [0, jitterMin] minutos.
 */
function scheduleNextAttempt(
  baseTime:    Date,
  delayMin:    number,
  allowedDays: number[] | null | undefined,
  tw:          TimeWindow | null | undefined,
  jitterMin  = 60,
): string {
  const naive = new Date(baseTime.getTime() + delayMin * 60_000);

  // Sem janela configurada → sem ajuste
  if (!allowedDays || allowedDays.length === 0 || !tw?.start || !tw?.end || !tw?.timezone) {
    return naive.toISOString();
  }

  if (isWithinWindowAt(naive, allowedDays, tw)) {
    return naive.toISOString(); // dentro da janela → sem jitter necessário
  }

  // Fora da janela → próximo início de janela + jitter aleatório
  const nextStart = nextWindowStart(naive, allowedDays, tw);
  const jitterMs  = Math.floor(Math.random() * (jitterMin + 1)) * 60_000;
  return new Date(nextStart.getTime() + jitterMs).toISOString();
}

function isWithinTimeWindow(
  allowedDays: number[] | null | undefined,
  window: TimeWindow | null | undefined
): boolean {
  // Modo de teste: ignora janela de horário
  if (BYPASS_TIME_WINDOW) return true;

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

  // Aliases bidirecionais entre nomes canônicos e nomes originais de colunas.
  // Garante que {{first_name}} funcione se o CSV tinha coluna "nome" (e vice-versa),
  // e que {{empresa}} funcione se o CSV tinha coluna "company".
  const FIELD_ALIASES: Array<[string, string[]]> = [
    ["first_name", ["name", "nome", "primeiro_nome"]],
    ["name",       ["first_name", "nome"]],
    ["empresa",    ["company", "companhia"]],
    ["company",    ["empresa", "companhia"]],
    ["last_name",  ["sobrenome", "ultimo_nome"]],
    ["sobrenome",  ["last_name"]],
  ];
  for (const [target, sources] of FIELD_ALIASES) {
    if (!variableValues[target]) {
      for (const src of sources) {
        if (variableValues[src]) {
          variableValues[target] = variableValues[src];
          break;
        }
      }
    }
  }

  // customer: apenas campos aceitos pelo Vapi (number, name, extension)
  const nameValue =
    customerData.name ??
    customerData.Name ??
    customerData.nome ??
    customerData.first_name ??
    customerData.primeiro_nome ??
    null;

  // Vapi exige name <= 40 chars
  let safeName = nameValue ? String(nameValue).trim() : undefined;
  if (safeName && safeName.length > 40) {
    safeName = safeName.substring(0, 37) + "...";
  }

  const customerPayload: Record<string, unknown> = {
    number: phoneE164,
    ...(safeName ? { name: safeName } : {}),
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
// Registro de falha de dispatch (call_record fantasma)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um call_record "fantasma" para falhas de dispatch.
 * Permite rastrear por que um lead falhou mesmo sem chamada real na Vapi.
 * Resolve a discrepância entre leads concluídos e chamadas registradas.
 */
async function createDispatchFailureRecord(
  supabase: SupabaseClient,
  tenantId: string,
  queueId: string,
  leadId: string,
  endedReason: string,
  summary?: string,
): Promise<void> {
  const { error } = await supabase.from("call_records").insert({
    tenant_id:           tenantId,
    dial_queue_id:       queueId,
    lead_id:             leadId,
    vapi_call_id:        `dispatch-fail-${Date.now()}-${leadId.slice(0, 8)}`,
    status:              "ended",
    ended_reason:        endedReason,
    duration_seconds:    0,
    cost:                0,
    summary:             summary ?? `Falha no dispatch: ${endedReason}`,
    is_dispatch_failure: true,
  });
  if (error) {
    console.error(`[worker] ⚠ Falha ao criar dispatch failure record para lead ${leadId}:`, error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar lead individual
// ─────────────────────────────────────────────────────────────────────────────

interface ProcessLeadResult {
  hitLimit:       boolean;   // true = Over Concurrency Limit → abortar loop da fila
  remainingSlots?: number;  // slots restantes informados pelo Vapi (remainingConcurrentCalls)
}

/**
 * Processa um lead individual: claim atômico → chamada Vapi → call_record.
 * Retorna `{ hitLimit: true }` se atingiu Over Concurrency Limit (fila deve parar).
 * Retorna `{ hitLimit: false, remainingSlots: N }` após chamada bem-sucedida;
 * se `remainingSlots === 0` o loop deve parar antes de tentar o próximo lead.
 */
async function processLead(
  supabase: SupabaseClient,
  queue:    DialQueue,
  lead:     Lead,
  vapiKey:  string,
): Promise<ProcessLeadResult> {
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
    return { hitLimit: false };
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

    // ── 3. Verificar se o Vapi bloqueou por concorrência mesmo com status 200 ──
    // Cenário edge-case: Vapi retorna 200 mas concurrencyBlocked=true.
    // Tratar igual ao erro "Over Concurrency Limit": reverter lead, cooldown, abortar fila.
    if (vapiCall.concurrencyBlocked === true) {
      setTenantConcurrencyCooldown(queue.tenant_id);
      console.warn(
        `[worker] ⚠ concurrencyBlocked=true (200 OK) — revertendo lead ${lead.id} sem contar tentativa` +
        ` | fila=${queue.name} | tenant=${tName(queue.tenant_id)}` +
        ` | cooldown ativo por ${CONCURRENCY_COOLDOWN_MS / 1000}s`
      );
      await supabase
        .from("leads")
        .update({
          status:          lead.status,
          attempt_count:   lead.attempt_count,
          next_attempt_at: new Date(Date.now() + CONCURRENCY_COOLDOWN_MS).toISOString(),
          last_outcome:    "concurrency-limited",
        })
        .eq("id", lead.id);
      return { hitLimit: true };
    }

    // ── 4. Criar call_record ──
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

    const remaining = vapiCall.remainingConcurrentCalls;
    console.log(
      `[worker] ✓ Chamada iniciada | tenant=${tName(queue.tenant_id)} | lead=${lead.id}` +
      ` | phone=${lead.phone_e164} | vapi_call=${vapiCall.id}` +
      (remaining !== undefined ? ` | slots_restantes=${remaining}` : ""),
    );

    return { hitLimit: false, remainingSlots: remaining };
  } catch (err) {
    // ── 4. Falha na API Vapi → reagendar ou marcar como falha ──
    const isRateLimit       = err instanceof AxiosError && err.response?.status === 429;
    const httpStatus        = err instanceof AxiosError ? err.response?.status : null;
    const errorBody         = err instanceof AxiosError ? JSON.stringify(err.response?.data) : null;
    const errorLabel        = err instanceof AxiosError
      ? `HTTP ${httpStatus}: ${errorBody}`
      : String(err);

    // ── Over Concurrency Limit (400 com "Over Concurrency Limit" no body) ──
    // Nenhuma chamada foi estabelecida — reverter status sem contar tentativa.
    const errMessage = err instanceof AxiosError ? (err.response?.data as any)?.message : null;
    const isConcurrencyLimit =
      httpStatus === 400 &&
      typeof errMessage === "string" &&
      errMessage.toLowerCase().includes("over concurrency limit");

    if (isConcurrencyLimit) {
      // Ativar cooldown de tenant em memória: bloqueia novas tentativas por 60s
      setTenantConcurrencyCooldown(queue.tenant_id);
      console.warn(
        `[worker] ⚠ Over Concurrency Limit — revertendo lead ${lead.id} sem contar tentativa` +
        ` | fila=${queue.name} | tenant=${tName(queue.tenant_id)}` +
        ` | cooldown ativo por ${CONCURRENCY_COOLDOWN_MS / 1000}s`
      );
      await supabase
        .from("leads")
        .update({
          status:          lead.status,
          attempt_count:   lead.attempt_count,
          next_attempt_at: new Date(Date.now() + CONCURRENCY_COOLDOWN_MS).toISOString(),
          last_outcome:    "concurrency-limited",
        })
        .eq("id", lead.id);
      return { hitLimit: true }; // sinal para abortar o restante do loop desta fila
    }

    // ── Recurso não encontrado na Vapi (404) ── erro permanente de configuração ──
    // assistantId ou phoneNumberId inválido/deletado. Todos os leads desta fila falhariam
    // pelo mesmo motivo — pausar a fila inteira e registrar o erro para o operador corrigir.
    if (httpStatus === 404) {
      const errMsg =
        `Recurso não encontrado no Vapi (404). Verifique se o assistente e o número de ` +
        `telefone ainda existem no painel Vapi. ` +
        `assistantId=${queue.assistant_id} | phoneNumberId=${queue.phone_number_id}`;
      console.error(
        `[worker] ✗ 404 Vapi — pausando fila "${queue.name}" | tenant=${tName(queue.tenant_id)} | ${errMsg}`
      );
      // Reverter lead sem contar tentativa
      await supabase
        .from("leads")
        .update({
          status:        lead.status,
          attempt_count: lead.attempt_count,
          last_outcome:  "config-error-404",
        })
        .eq("id", lead.id);
      // Pausar fila e registrar motivo
      await supabase
        .from("dial_queues")
        .update({ status: "paused", last_error: errMsg })
        .eq("id", queue.id);
      return { hitLimit: false };
    }

    // ── Erro de validação de dados (422) ── falha permanente, não tentar de novo ──
    // Ocorre quando: número não é E.164 válido, nome > 40 chars, etc.
    // Retentar não adianta — o dado em si é inválido. Marcar como failed definitivo.
    if (httpStatus === 422) {
      let lastOutcome = "invalid-data";
      const msgLower = (typeof errMessage === "string" ? errMessage : (errorBody ?? "")).toLowerCase();
      if (msgLower.includes("e.164") || msgLower.includes("phone") || msgLower.includes("number")) {
        lastOutcome = "invalid-phone";
      } else if (msgLower.includes("name") || msgLower.includes("characters")) {
        lastOutcome = "invalid-name";
      }
      console.error(
        `[worker] ✗ Dado inválido para lead ${lead.id} (${lead.phone_e164}) — falha permanente` +
        ` | outcome=${lastOutcome} | fila=${queue.name}` +
        ` | resposta Vapi: ${errorBody}`
      );
      await Promise.all([
        supabase
          .from("leads")
          .update({
            status:        "failed",
            attempt_count: newAttemptCount,
            last_outcome:  lastOutcome,
          })
          .eq("id", lead.id),
        createDispatchFailureRecord(
          supabase, queue.tenant_id, queue.id, lead.id,
          `dispatch-${lastOutcome}`,
          `Dado inválido: ${lastOutcome} — ${errorBody?.slice(0, 200) ?? "sem detalhe"}`,
        ),
      ]);
      return { hitLimit: false };
    }

    console.error(
      `[worker] ✗ Falha ao ligar para ${lead.phone_e164}` +
      ` | tentativa ${newAttemptCount}/${queue.max_attempts}` +
      ` | fila=${queue.name} | tenant=${tName(queue.tenant_id)}` +
      ` | erro: ${errorLabel}`,
    );

    // ── Número inválido detectado pelo Vapi (HTTP 400 com mensagem de E.164) ──
    // O Vapi retorna 400 (não 422) quando customer.number não é E.164 válido.
    // Retentar não resolve — o número em si é inválido. Marcar como falha permanente.
    if (httpStatus === 400 && !isConcurrencyLimit) {
      const bodyLower = (errorBody ?? "").toLowerCase();
      const isInvalidPhone =
        bodyLower.includes("e.164") ||
        bodyLower.includes("customer.number") ||
        bodyLower.includes("valid phone number");

      if (isInvalidPhone) {
        console.error(
          `[worker] ✗ Número inválido (E.164) para lead ${lead.id} (${lead.phone_e164}) — falha permanente` +
          ` | fila=${queue.name} | resposta Vapi: ${errorBody}`
        );
        await Promise.all([
          supabase
            .from("leads")
            .update({
              status:        "failed",
              attempt_count: newAttemptCount,
              last_outcome:  "invalid-phone",
            })
            .eq("id", lead.id),
          createDispatchFailureRecord(
            supabase, queue.tenant_id, queue.id, lead.id,
            "dispatch-invalid-phone",
            `Número ${lead.phone_e164} não é E.164 válido`,
          ),
        ]);
        return { hitLimit: false };
      }

      console.error(
        `[worker] ⚠ Payload rejeitado pelo Vapi (HTTP 400) — verifique assistantId e phoneNumberId` +
        ` | assistantId=${queue.assistant_id} | phoneNumberId=${queue.phone_number_id}` +
        ` | resposta Vapi: ${errorBody}`
      );
    }

    // ── Erros SIP no DISPATCH (503/408 ao chamar POST /call/phone) ──
    // Ocorre ANTES da chamada ser criada — nenhum call_record foi gerado.
    // Causa: SIP provider sobrecarregado no momento do disparo (transitório).
    // → Reverter sem contar tentativa; retry em 60s.
    // Nota: se o 503 vier DEPOIS da criação (via webhook), é tratado como SIP ambíguo
    // no webhook handler — nesse caso conta como tentativa para evitar loop em número inválido.
    const isDispatchSipFault = httpStatus === 503 || httpStatus === 408;
    if (isDispatchSipFault) {
      const nextAt = new Date(Date.now() + 60_000).toISOString();
      console.warn(
        `[worker] ⚠ SIP indisponível no dispatch (HTTP ${httpStatus}) | lead=${lead.id} (${lead.phone_e164})` +
        ` | fila="${queue.name}" | tenant=${tName(queue.tenant_id)} — retry em 60s sem contar tentativa`
      );
      await supabase
        .from("leads")
        .update({
          status:          lead.status,        // volta ao status original (queued/callbackScheduled)
          attempt_count:   lead.attempt_count, // reverte — erro de infra não conta como tentativa
          next_attempt_at: nextAt,
          last_outcome:    `provider-${httpStatus}`,
        })
        .eq("id", lead.id);
      return { hitLimit: false };
    }

    if (newAttemptCount < queue.max_attempts) {
      // Ainda tem tentativas — reagendar com delay (com jitter se cair fora da janela)
      const delayMin   = isRateLimit ? queue.retry_delay_minutes * 2 : queue.retry_delay_minutes;
      const allowedDays = Array.isArray(queue.allowed_days) ? (queue.allowed_days as unknown as number[]) : [];
      const nextAt      = scheduleNextAttempt(new Date(), delayMin, allowedDays, queue.allowed_time_window);

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
      await Promise.all([
        supabase
          .from("leads")
          .update({
            status:        "failed",
            attempt_count: newAttemptCount,
            last_outcome:  "api-error",
          })
          .eq("id", lead.id),
        createDispatchFailureRecord(
          supabase, queue.tenant_id, queue.id, lead.id,
          "dispatch-api-error",
          `Tentativas esgotadas (${newAttemptCount}/${queue.max_attempts}) — último erro: ${errorLabel?.slice(0, 200) ?? "desconhecido"}`,
        ),
      ]);
    }
  }
  return { hitLimit: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar fila
// ─────────────────────────────────────────────────────────────────────────────

async function processQueue(supabase: SupabaseClient, queue: DialQueue, tenantSlotBudget?: number): Promise<void> {
  // ── Circuit Breaker: verificar se o provedor SIP está em cooldown ──
  if (queue.last_error) {
    try {
      const cb = JSON.parse(queue.last_error) as { circuit_open_until?: string };
      if (cb.circuit_open_until && new Date(cb.circuit_open_until) > new Date()) {
        const remainingMin = Math.ceil((new Date(cb.circuit_open_until).getTime() - Date.now()) / 60_000);
        console.warn(
          `[worker] ⚡ Fila "${queue.name}" com circuit breaker ativo (${remainingMin}min restantes) — aguardando recuperação do SIP`
        );
        return;
      }
    } catch { /* last_error não é JSON do circuit breaker — ignorar e continuar */ }
  }

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

  // Slots disponíveis desta fila (limite per-queue)
  const perQueueAvailable = queue.concurrency - (activeCount ?? 0);
  // Se tiver budget de tenant, respeita o menor dos dois limites
  const slots = tenantSlotBudget !== undefined
    ? Math.min(perQueueAvailable, tenantSlotBudget)
    : perQueueAvailable;
  if (slots <= 0) {
    console.log(
      `[worker] Fila="${queue.name}" | sem slots disponíveis` +
      ` (calling_db=${activeCount ?? 0}, concurrency_fila=${queue.concurrency}` +
      (tenantSlotBudget !== undefined ? `, budget_tenant=${tenantSlotBudget}` : "") +
      `) — aguardando`
    );
    return; // Concorrência máxima atingida
  }

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
  const freshSlots = slots - (priorityLeads?.length ?? 0);
  const freshLeads = freshSlots > 0
    ? (await supabase
        .from("leads")
        .select("id, phone_e164, data_json, status, attempt_count")
        .eq("tenant_id",    queue.tenant_id)
        .eq("lead_list_id", queue.lead_list_id)
        .eq("status",       "queued")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
        .order("next_attempt_at", { ascending: true, nullsFirst: true })
        .limit(freshSlots)
      ).data
    : [];

  let leads: Lead[] = [
    ...(priorityLeads ?? []),
    ...(freshLeads    ?? []),
  ] as Lead[];

  if (leads.length === 0) return;

  // ── Filtro de limite diário ──────────────────────────────────────────────────
  // Se max_daily_attempts > 0, remover leads que já atingiram o limite de hoje.
  // "Hoje" = meia-noite do timezone da fila (ou UTC como fallback).
  if (queue.max_daily_attempts > 0) {
    const tz = queue.allowed_time_window?.timezone ?? "UTC";
    // Início do dia atual no timezone da fila (mesmo padrão do nextWindowStart)
    const dateFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short" }); // "YYYY-MM-DD"
    const hFmt    = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false });
    const mFmt    = new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "2-digit" });
    const approx      = new Date(`${dateFmt.format(new Date())}T00:00:00Z`);
    const hAtApprox   = parseInt(hFmt.format(approx));
    const mAtApprox   = parseInt(mFmt.format(approx));
    // Para UTC-: hora local no approx pertence ao dia anterior (ex: 21h para UTC-3).
    // O delta correto é: avançar (24 - hAtApprox) horas (não recuar hAtApprox horas).
    // Normalização: se deltaMin < -12h (i.e., fuso negativo), adicionar 24h.
    let deltaMin = -(hAtApprox * 60 + mAtApprox);
    if (deltaMin < -(12 * 60)) deltaMin += 24 * 60;
    const todayStartUTC = new Date(approx.getTime() + deltaMin * 60_000).toISOString();

    const leadIds = leads.map((l) => l.id);
    const { data: todayRecords } = await supabase
      .from("call_records")
      .select("lead_id")
      .in("lead_id", leadIds)
      .gte("created_at", todayStartUTC);

    const dailyCount = new Map<string, number>();
    for (const r of todayRecords ?? []) {
      const id = (r as { lead_id: string }).lead_id;
      dailyCount.set(id, (dailyCount.get(id) ?? 0) + 1);
    }

    const overLimitIds: string[] = [];
    leads = leads.filter((l) => {
      if ((dailyCount.get(l.id) ?? 0) >= queue.max_daily_attempts) {
        overLimitIds.push(l.id);
        return false;
      }
      return true;
    });

    // Reagendar leads que atingiram o limite para o próximo dia (início da janela permitida)
    if (overLimitIds.length > 0) {
      const nextDayStart = nextWindowStart(new Date(), queue.allowed_days ?? [], queue.allowed_time_window);
      const jitterMs    = Math.floor(Math.random() * 61) * 60_000; // 0-60 min de jitter
      const retryAt     = new Date(nextDayStart.getTime() + jitterMs).toISOString();

      await supabase
        .from("leads")
        .update({ next_attempt_at: retryAt })
        .in("id", overLimitIds);

      console.log(
        `[worker] Fila="${queue.name}" | ${overLimitIds.length} lead(s) atingiram o limite diário` +
        ` (${queue.max_daily_attempts}/dia) — reagendados para ${retryAt}`
      );
    }

    if (leads.length === 0) return;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  console.log(
    `[worker] ┌─ Fila="${queue.name}" | tenant=${tName(queue.tenant_id)}` +
    ` | calling_db=${activeCount ?? 0}/${queue.concurrency}` +
    (tenantSlotBudget !== undefined ? ` | budget_tenant=${tenantSlotBudget}` : "") +
    ` | slots=${slots} | dispatch=${leads.length} lead(s)` +
    ` | phones=[${leads.map(l => l.phone_e164).join(", ")}]`
  );

  // ── Buscar chave Vapi do tenant ──
  const vapiKey = await getVapiKey(supabase, queue.tenant_id);
  if (!vapiKey) {
    console.warn(`[worker] Tenant ${tName(queue.tenant_id)} sem chave Vapi ativa — fila ${queue.name} ignorada`);
    return;
  }

  // ── Processar leads em sequência (um por um para não sobrecarregar a Vapi/SIP) ──
  // DISPATCH_DELAY_MS entre chamadas: evita HTTP 429 (Vapi rate limit) e 503/408 (SIP overload)
  // Condições de abort do loop:
  //   1. hitLimit=true  → Vapi retornou Over Concurrency Limit (HTTP 400 ou concurrencyBlocked)
  //   2. remainingSlots === 0 → Vapi informa em tempo real que não há mais slots disponíveis
  //      (mais preciso que o cálculo local do DB, que pode divergir por webhooks atrasados)
  let dispatched = 0;
  let stopReason: "done" | "hitLimit" | "noSlotsVapi" = "done";

  for (const lead of leads) {
    const result = await processLead(supabase, queue, lead, vapiKey);
    if (result.hitLimit) {
      stopReason = "hitLimit";
      break;
    }
    dispatched++;
    // Vapi confirmou que não há slots restantes → cooldown e parar
    if (result.remainingSlots === 0) {
      console.warn(
        `[worker] ⚠ Vapi informou remainingConcurrentCalls=0 após disparar lead ${lead.id}` +
        ` | fila=${queue.name} | tenant=${tName(queue.tenant_id)}` +
        ` — aplicando cooldown de ${CONCURRENCY_COOLDOWN_MS / 1000}s e encerrando loop`
      );
      setTenantConcurrencyCooldown(queue.tenant_id);
      stopReason = "noSlotsVapi";
      break;
    }
    // Só aplica delay se há mais leads a processar
    if (dispatched < leads.length) {
      await sleep(DISPATCH_DELAY_MS);
    }
  }

  const stopLabel =
    stopReason === "done"       ? "batch completo" :
    stopReason === "hitLimit"   ? "OVER CONCURRENCY LIMIT" :
    /* noSlotsVapi */             "Vapi: 0 slots restantes";
  console.log(
    `[worker] └─ Fila="${queue.name}" | ${dispatched}/${leads.length} chamada(s) disparada(s) | motivo_parada=${stopLabel}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Controle de minutos contratados
// Atualiza o cache de uso mensal e bloqueia o tenant se atingir 100%.
// Chamado a cada ~60s independente do POLL_INTERVAL_MS.
// ─────────────────────────────────────────────────────────────────────────────

async function updateMinutesCache(supabase: SupabaseClient): Promise<void> {
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: connections, error } = await supabase
    .from("vapi_connections")
    .select("id, tenant_id, contracted_minutes, minutes_blocked")
    .eq("is_active", true)
    .not("contracted_minutes", "is", null);

  if (error) {
    console.error("[worker] updateMinutesCache: erro ao buscar conexões:", error.message);
    return;
  }
  if (!connections || connections.length === 0) return;

  for (const conn of connections as Array<{
    id: string;
    tenant_id: string;
    contracted_minutes: number;
    minutes_blocked: boolean;
  }>) {
    try {
      const { data: totalSeconds, error: rpcErr } = await supabase
        .rpc("get_monthly_call_seconds", {
          p_tenant_id:      conn.tenant_id,
          p_first_of_month: firstOfMonth,
        });

      if (rpcErr) {
        console.error(`[worker] updateMinutesCache: RPC erro tenant ${tName(conn.tenant_id)}:`, rpcErr.message);
        continue;
      }

      const usedSeconds: number = (totalSeconds as number) ?? 0;
      const usedMinutes = Math.ceil(usedSeconds / 60);

      const updates: Record<string, unknown> = {
        minutes_used_cache:  usedSeconds,
        minutes_cache_month: currentMonth,
      };

      if (!conn.minutes_blocked && usedMinutes >= conn.contracted_minutes) {
        updates.minutes_blocked = true;
        console.warn(
          `[worker] ⛔ Tenant ${tName(conn.tenant_id)} atingiu limite de minutos` +
          ` (${usedMinutes}/${conn.contracted_minutes} min) — bloqueando e pausando campanhas`
        );
        await supabase
          .from("dial_queues")
          .update({ status: "paused" })
          .eq("tenant_id", conn.tenant_id)
          .eq("status", "running");
      }

      await supabase
        .from("vapi_connections")
        .update(updates)
        .eq("id", conn.id);

    } catch (err) {
      console.error(`[worker] updateMinutesCache: erro tenant ${tName(conn.tenant_id)}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery: libera leads travados em "calling" há mais de STALE_CALLING_MINUTES
// ─────────────────────────────────────────────────────────────────────────────

const STALE_CALLING_MINUTES = Number(process.env.STALE_CALLING_MINUTES ?? 15);

async function recoverStaleCalls(supabase: SupabaseClient): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_CALLING_MINUTES * 60 * 1000).toISOString();

  // 1. Buscar leads presos em "calling" há mais de STALE_CALLING_MINUTES
  //    Usa last_attempt_at como proxy: o worker seta status="calling" e last_attempt_at ao mesmo tempo
  //    NOTA: updated_at não existe na tabela leads — o campo correto é last_attempt_at
  // Respeitar isolamento por tenant no recovery
  const myTenants = await resolveMyTenants(supabase);

  let staleQuery = supabase
    .from("leads")
    .select("id, phone_e164, lead_list_id, tenant_id, attempt_count")
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
  const recoverableLeads = stale.filter(
    (l: { id: string; lead_list_id: string }) => recoverableListIds.has(l.lead_list_id)
  );

  const skippedCount = stale.length - recoverableLeads.length;
  if (skippedCount > 0) {
    console.log(
      `[worker] recoverStaleCalls: ${skippedCount} lead(s) ignorados (fila stopped/inexistente)`
    );
  }

  if (recoverableLeads.length === 0) return;

  console.warn(
    `[worker] ⚠ ${recoverableLeads.length} lead(s) presos em "calling" há >${STALE_CALLING_MINUTES}min — processando com contagem de tentativas`
  );

  // Buscar max_attempts das filas envolvidas
  const recoverableListIdsList = [...new Set(recoverableLeads.map((l: { lead_list_id: string }) => l.lead_list_id))];
  const { data: queueConfigs } = await supabase
    .from("dial_queues")
    .select("lead_list_id, max_attempts")
    .in("lead_list_id", recoverableListIdsList);

  const maxAttemptsMap = new Map<string, number>(
    (queueConfigs ?? []).map((q: { lead_list_id: string; max_attempts: number | null }) => [
      q.lead_list_id,
      q.max_attempts ?? 3,
    ])
  );

  const retryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // retry em 2 min
  let failedCount = 0;
  let requeuedCount = 0;

  for (const lead of recoverableLeads as Array<{ id: string; lead_list_id: string; attempt_count: number }>) {
    const maxAttempts    = maxAttemptsMap.get(lead.lead_list_id) ?? 3;
    const newAttemptCount = (lead.attempt_count ?? 0) + 1;

    if (newAttemptCount >= maxAttempts) {
      // Tentativas esgotadas → falhou definitivamente
      await supabase
        .from("leads")
        .update({
          status:          "failed",
          last_outcome:    "stale-calling-reset",
          next_attempt_at: null,
          attempt_count:   newAttemptCount,
        })
        .eq("id", lead.id);
      failedCount++;
    } else {
      // Ainda tem tentativas → volta para fila contando esta como tentativa
      await supabase
        .from("leads")
        .update({
          status:          "queued",
          last_outcome:    "stale-calling-reset",
          next_attempt_at: retryAt,
          attempt_count:   newAttemptCount,
        })
        .eq("id", lead.id);
      requeuedCount++;
    }
  }

  console.log(
    `[worker] ✓ stale recovery: ${requeuedCount} recolocado(s) em fila, ${failedCount} marcado(s) como failed (tentativas esgotadas)`
  );
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
      concurrency, max_attempts, retry_delay_minutes, max_daily_attempts,
      allowed_days, allowed_time_window, last_error
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

  // ── Distribuição proporcional de slots Vapi por tenant ──────────────────────
  // Cada tenant tem um limite de concorrência no nível da org Vapi (ex: 10 slots).
  // Quando há múltiplas campanhas ativas no mesmo tenant, dividimos os slots livres
  // proporcionalmente entre elas — nenhuma campanha ultrapassa o teto da org.
  const allQueues = queues as DialQueue[];

  // Agrupar filas por tenant
  const queuesByTenant = new Map<string, DialQueue[]>();
  for (const queue of allQueues) {
    if (!queuesByTenant.has(queue.tenant_id)) queuesByTenant.set(queue.tenant_id, []);
    queuesByTenant.get(queue.tenant_id)!.push(queue);
  }

  // Calcular budget de slots para cada fila
  const queueSlotBudgets = new Map<string, number>(); // queueId → slots disponíveis

  await Promise.all(
    Array.from(queuesByTenant.entries()).map(async ([tenantId, tenantQueues]) => {
      // Buscar limite configurado da org Vapi
      const { data: conn } = await supabase
        .from("vapi_connections")
        .select("concurrency_limit, minutes_blocked, contracted_minutes")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .single();

      // Se o tenant está bloqueado por consumo de minutos, não disparar nenhuma chamada
      if ((conn as { minutes_blocked?: boolean } | null)?.minutes_blocked) {
        console.log(`[worker] Tenant ${tName(tenantId)} bloqueado por limite de minutos — todas as filas ignoradas`);
        for (const q of tenantQueues) queueSlotBudgets.set(q.id, 0);
        return;
      }

      // Se o tenant está em cooldown de concorrência (Over Concurrency Limit recente),
      // aguardar antes de tentar novamente — evita o loop de tentativas rejeitadas
      if (isTenantInConcurrencyCooldown(tenantId)) {
        console.log(`[worker] Tenant ${tName(tenantId)} em cooldown de concorrência — aguardando antes de retomar`);
        for (const q of tenantQueues) queueSlotBudgets.set(q.id, 0);
        return;
      }

      const tenantLimit: number = (conn as { concurrency_limit?: number } | null)?.concurrency_limit ?? 10;

      // Contar chamadas ativas do tenant via leads.status='calling'.
      // Fonte única de verdade: o worker seta status='calling' atomicamente antes de chamar o Vapi,
      // e o webhook (end-of-call-report) ou o recoverStaleCalls resetam para outro status ao término.
      // Usar call_records.ended_reason IS NULL tinha um filtro de 60min que causava undercounting:
      // após 60min, registros velhos (sem webhook por falha) deixavam de ser contados, permitindo
      // dispatches extras que ultrapassavam o limite real da org no Vapi.
      const { count: tenantActiveCalls } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "calling");

      const freeSlots = Math.max(0, tenantLimit - (tenantActiveCalls ?? 0));

      if (freeSlots === 0) {
        console.log(
          `[worker] Tenant ${tName(tenantId)} sem slots livres (leads_em_calling=${tenantActiveCalls}, limite=${tenantLimit}) — todas as filas aguardam`
        );
        for (const q of tenantQueues) queueSlotBudgets.set(q.id, 0);
        return;
      }

      // Distribuir slots livres proporcionalmente entre as filas ativas
      // Base: floor(freeSlots / numQueues); o resto vai às primeiras filas (1 a mais cada)
      const numQueues = tenantQueues.length;
      const base      = Math.floor(freeSlots / numQueues);
      const remainder = freeSlots % numQueues;

      tenantQueues.forEach((q, i) => {
        const budget = Math.min(base + (i < remainder ? 1 : 0), q.concurrency);
        queueSlotBudgets.set(q.id, budget);
      });

      if (numQueues > 1) {
        console.log(
          `[worker] Tenant ${tName(tenantId)} | limite=${tenantLimit} | leads_em_calling=${tenantActiveCalls ?? 0} | ` +
          `livres=${freeSlots} | distribuídos entre ${numQueues} filas: ` +
          tenantQueues.map((q, i) => `"${q.name}"=${queueSlotBudgets.get(q.id)}`).join(", ")
        );
      }
    })
  );

  // Processar todas as filas em paralelo — múltiplas campanhas rodam simultaneamente
  await Promise.all(
    allQueues.map((queue) =>
      processQueue(supabase, queue, queueSlotBudgets.get(queue.id)).catch((err) =>
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
  await refreshTenantNames(supabase).catch(() => {});
  console.log(`[worker] ✓ Cache de nomes carregado (${tenantNameCache.size} tenant(s))`);

  // Graceful shutdown
  let running = true;
  const shutdown = (signal: string) => {
    console.log(`[worker] ${signal} recebido — encerrando após o ciclo atual...`);
    running = false;
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  // Frequência do recovery de stale calls: a cada ~60s (independente do POLL_INTERVAL_MS)
  const STALE_RECOVERY_EVERY_N_CYCLES  = Math.max(1, Math.round(60_000  / POLL_INTERVAL_MS));
  // Frequência da atualização de cache de minutos: a cada ~60s
  const MINUTES_CACHE_EVERY_N_CYCLES   = Math.max(1, Math.round(60_000  / POLL_INTERVAL_MS));
  // Frequência do refresh do cache de nomes de tenants: a cada ~5min
  const TENANT_NAMES_EVERY_N_CYCLES    = Math.max(1, Math.round(300_000 / POLL_INTERVAL_MS));

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

    // Atualização periódica do cache de minutos contratados
    if (cycleCount % MINUTES_CACHE_EVERY_N_CYCLES === 0) {
      try {
        await updateMinutesCache(supabase);
      } catch (err) {
        console.error("[worker] Erro no updateMinutesCache:", err);
      }
    }

    // Refresh periódico do cache de nomes de tenants (~5min)
    if (cycleCount % TENANT_NAMES_EVERY_N_CYCLES === 0) {
      refreshTenantNames(supabase).catch(() => {});
    }

    // Heartbeat simples no console a cada ~5 minutos (para monitoramento de logs)
    if (cycleCount % TENANT_NAMES_EVERY_N_CYCLES === 0) {
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
