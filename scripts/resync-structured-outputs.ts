/**
 * scripts/resync-structured-outputs.ts
 *
 * Re-sincroniza o structured output das chamadas a partir da API da Vapi.
 *
 * Contexto: o webhook antigo priorizava analysis.structuredData (formato plano
 * legado) e descartava o artifact.structuredOutputs (Structured Output novo).
 * Resultado: muitas chamadas ficaram com o structured_outputs "errado" no banco
 * e a coluna Resultado vazia. Este script busca o artifact.structuredOutputs
 * direto da Vapi e regrava call_records.structured_outputs — o trigger
 * trg_fn_flatten_call_record re-achata e repopula call_records_flat
 * (incluindo o critério de sucesso por assistente).
 *
 * Execução (exemplos):
 *   npx tsx --env-file=.env scripts/resync-structured-outputs.ts
 *   RESYNC_DAYS=7 npx tsx --env-file=.env scripts/resync-structured-outputs.ts
 *   RESYNC_DAYS=7 RESYNC_TENANT_ID=<uuid> npx tsx --env-file=.env scripts/resync-structured-outputs.ts
 *   RESYNC_DRY_RUN=1 RESYNC_DAYS=3 npx tsx --env-file=.env scripts/resync-structured-outputs.ts
 *
 * Variáveis de ambiente:
 *   NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL)   — obrigatória
 *   SUPABASE_SERVICE_ROLE_KEY                    — obrigatória
 *   ENCRYPTION_KEY_BASE64                        — obrigatória (descriptografa chave Vapi)
 *   RESYNC_DAYS        — janela em dias (default 7). Só processa chamadas recentes.
 *   RESYNC_TENANT_ID   — limita a um tenant (opcional; recomendado para validar).
 *   RESYNC_DRY_RUN     — "1"/"true" para apenas simular (não grava).
 *   RESYNC_CONCURRENCY — chamadas paralelas à Vapi (default 5).
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL         = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY_B64   = process.env.ENCRYPTION_KEY_BASE64!;
const VAPI_BASE_URL        = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

const DAYS        = Math.max(1, parseInt(process.env.RESYNC_DAYS ?? "7"));
const TENANT_ID   = process.env.RESYNC_TENANT_ID?.trim() || null;
const DRY_RUN     = /^(1|true)$/i.test(process.env.RESYNC_DRY_RUN ?? "");
const CONCURRENCY = Math.max(1, Math.min(20, parseInt(process.env.RESYNC_CONCURRENCY ?? "5")));

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ENCRYPTION_KEY_B64) {
  console.error("✗ Variáveis obrigatórias ausentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY_BASE64");
  process.exit(1);
}

function decryptAesGcm(cipherText: string): string {
  const key     = Buffer.from(ENCRYPTION_KEY_B64, "base64");
  const payload = JSON.parse(Buffer.from(cipherText, "base64").toString("utf8")) as {
    iv: string; tag: string; data: string;
  };
  const iv   = Buffer.from(payload.iv,   "base64");
  const tag  = Buffer.from(payload.tag,  "base64");
  const data = Buffer.from(payload.data, "base64");
  const dec  = crypto.createDecipheriv("aes-256-gcm", key, iv) as crypto.DecipherGCM;
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

interface CallRecord {
  id:                 string;
  vapi_call_id:       string;
  tenant_id:          string;
  structured_outputs: Record<string, unknown> | null;
}

interface VapiConn { encrypted_private_key: string }

/** true se o objeto já está no formato artifact ({ id: { result: {...} } }). */
function hasArtifactWrapper(so: Record<string, unknown> | null): boolean {
  if (!so || typeof so !== "object") return false;
  return Object.values(so).some(
    (v) => v != null && typeof v === "object" && !Array.isArray(v) && "result" in (v as Record<string, unknown>)
  );
}

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const sinceIso = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  console.log(
    `Re-sync structured outputs | janela=${DAYS}d (desde ${sinceIso})` +
    `${TENANT_ID ? ` | tenant=${TENANT_ID}` : " | todos os tenants"}` +
    `${DRY_RUN ? " | DRY-RUN" : ""} | concorrência=${CONCURRENCY}\n`
  );

  // Paginação para suportar volumes grandes
  const PAGE = 1000;
  let from = 0;
  const candidates: CallRecord[] = [];

  for (;;) {
    let q = supabase
      .from("call_records")
      .select("id, vapi_call_id, tenant_id, structured_outputs")
      .gte("created_at", sinceIso)
      .not("vapi_call_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (TENANT_ID) q = q.eq("tenant_id", TENANT_ID);

    const { data, error } = await q;
    if (error) { console.error("✗ Erro ao buscar registros:", error.message); process.exit(1); }
    if (!data?.length) break;

    // Só nos interessam as que NÃO estão já no formato artifact correto
    for (const rec of data as CallRecord[]) {
      if (!hasArtifactWrapper(rec.structured_outputs)) candidates.push(rec);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (!candidates.length) {
    console.log("✓ Nenhuma chamada candidata (todas já em formato artifact ou sem dados). Nada a fazer.");
    return;
  }

  console.log(`Candidatas a re-sync: ${candidates.length}\n`);

  // Cache de chaves Vapi por tenant
  const keyCache = new Map<string, string | null>();
  async function getVapiKey(tenantId: string): Promise<string | null> {
    if (keyCache.has(tenantId)) return keyCache.get(tenantId)!;
    const { data: conn } = await supabase
      .from("vapi_connections")
      .select("encrypted_private_key")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .single() as { data: VapiConn | null };
    if (!conn) { keyCache.set(tenantId, null); return null; }
    try {
      const key = decryptAesGcm(conn.encrypted_private_key);
      keyCache.set(tenantId, key);
      return key;
    } catch {
      console.warn(`  ⚠ Falha ao descriptografar chave do tenant ${tenantId}`);
      keyCache.set(tenantId, null);
      return null;
    }
  }

  let updated = 0, skipped = 0, noArtifact = 0, errors = 0;

  async function processOne(rec: CallRecord): Promise<void> {
    const vapiKey = await getVapiKey(rec.tenant_id);
    if (!vapiKey) { skipped++; return; }

    let res: Response;
    try {
      res = await fetch(`${VAPI_BASE_URL}/call/${rec.vapi_call_id}`, {
        headers: { Authorization: `Bearer ${vapiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.warn(`  [${rec.vapi_call_id}] erro de rede: ${err instanceof Error ? err.message : String(err)}`);
      errors++; return;
    }

    if (res.status === 404) { skipped++; return; }
    if (!res.ok) { console.warn(`  [${rec.vapi_call_id}] Vapi HTTP ${res.status}`); errors++; return; }

    const call = await res.json() as { artifact?: { structuredOutputs?: unknown } };
    const artifactSO = call.artifact?.structuredOutputs;

    if (!isNonEmptyObject(artifactSO)) { noArtifact++; return; }

    if (DRY_RUN) {
      console.log(`  ~ [${rec.vapi_call_id}] (dry-run) tem artifact com chaves: ${Object.keys(artifactSO).length}`);
      updated++; return;
    }

    const { error: updErr } = await supabase
      .from("call_records")
      .update({ structured_outputs: artifactSO })
      .eq("id", rec.id);

    if (updErr) { console.error(`  [${rec.vapi_call_id}] erro ao gravar: ${updErr.message}`); errors++; return; }
    console.log(`  ✓ [${rec.vapi_call_id}] structured_outputs atualizado (artifact)`);
    updated++;
  }

  // Pool de concorrência simples
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    await Promise.all(candidates.slice(i, i + CONCURRENCY).map(processOne));
  }

  console.log(`\n── Resumo ──────────────────────────────`);
  console.log(`  ${DRY_RUN ? "Seriam atualizados" : "Atualizados"}: ${updated}`);
  console.log(`  Sem artifact na Vapi:  ${noArtifact}`);
  console.log(`  Pulados (sem chave/404): ${skipped}`);
  console.log(`  Erros:                 ${errors}`);
  console.log(`────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("✗ Erro fatal:", err);
  process.exit(1);
});
