/**
 * scripts/reconcile-null-webhooks.ts
 *
 * Reconcilia call_records com ended_reason = NULL consultando a API da Vapi.
 * Útil quando o webhook não chegou (timeout, falha de rede, deploy no momento da chamada).
 *
 * Execução:
 *   npx tsx scripts/reconcile-null-webhooks.ts
 *
 * Variáveis de ambiente necessárias (mesmas do worker):
 *   NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ENCRYPTION_KEY_BASE64
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL         = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY_B64   = process.env.ENCRYPTION_KEY_BASE64!;
const VAPI_BASE_URL        = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ENCRYPTION_KEY_B64) {
  console.error("✗ Variáveis obrigatórias ausentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY_BASE64");
  process.exit(1);
}

function decryptAesGcm(cipherText: string): string {
  const key     = Buffer.from(ENCRYPTION_KEY_B64, "base64");
  const payload = JSON.parse(Buffer.from(cipherText, "base64").toString("utf8")) as {
    iv: string; tag: string; data: string;
  };
  const iv      = Buffer.from(payload.iv,   "base64");
  const tag     = Buffer.from(payload.tag,  "base64");
  const data    = Buffer.from(payload.data, "base64");
  const dec     = crypto.createDecipheriv("aes-256-gcm", key, iv) as crypto.DecipherGCM;
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

interface CallRecord {
  id:          string;
  vapi_call_id: string;
  tenant_id:   string;
  lead_id:     string;
}

interface VapiConn {
  encrypted_private_key: string;
}

interface VapiCall {
  endedReason?:    string;
  cost?:           number;
  durationSeconds?: number;
  status?:         string;
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
  };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // Buscar call_records com ended_reason NULL e vapi_call_id preenchido
  const { data: records, error } = await supabase
    .from("call_records")
    .select("id, vapi_call_id, tenant_id, lead_id")
    .is("ended_reason", null)
    .not("vapi_call_id", "is", null);

  if (error) {
    console.error("✗ Erro ao buscar registros:", error.message);
    process.exit(1);
  }

  if (!records?.length) {
    console.log("✓ Nenhum call_record com ended_reason=NULL encontrado. Nada a reconciliar.");
    return;
  }

  console.log(`Encontrados ${records.length} registros com ended_reason=NULL. Consultando Vapi...\n`);

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

  let updated = 0;
  let skipped = 0;
  let stillActive = 0;

  for (const rec of records as CallRecord[]) {
    const vapiKey = await getVapiKey(rec.tenant_id);
    if (!vapiKey) {
      console.warn(`  [${rec.vapi_call_id}] Sem chave Vapi para tenant ${rec.tenant_id} — pulando`);
      skipped++;
      continue;
    }

    const res = await fetch(`${VAPI_BASE_URL}/call/${rec.vapi_call_id}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });

    if (res.status === 404) {
      console.warn(`  [${rec.vapi_call_id}] Chamada não encontrada no Vapi (404) — pode ter expirado`);
      skipped++;
      continue;
    }

    if (!res.ok) {
      console.warn(`  [${rec.vapi_call_id}] Vapi retornou HTTP ${res.status} — pulando`);
      skipped++;
      continue;
    }

    const call = await res.json() as VapiCall;

    if (!call.endedReason) {
      if (call.status === "in-progress") {
        console.log(`  [${rec.vapi_call_id}] Chamada ainda em andamento (status=${call.status}) — ignorando`);
        stillActive++;
      } else {
        console.warn(`  [${rec.vapi_call_id}] Vapi não retornou endedReason (status=${call.status ?? "desconhecido"}) — pulando`);
        skipped++;
      }
      continue;
    }

    // Atualizar call_record com os dados da Vapi
    const { error: updateErr } = await supabase
      .from("call_records")
      .update({
        ended_reason:         call.endedReason,
        cost:                 call.cost         ?? null,
        duration_seconds:     call.durationSeconds ?? null,
        transcript:           call.artifact?.transcript ?? null,
        recording_url:        call.artifact?.recordingUrl ?? null,
        stereo_recording_url: call.artifact?.stereoRecordingUrl ?? null,
      })
      .eq("id", rec.id);

    if (updateErr) {
      console.error(`  [${rec.vapi_call_id}] Erro ao atualizar: ${updateErr.message}`);
      skipped++;
    } else {
      console.log(`  ✓ [${rec.vapi_call_id}] endedReason="${call.endedReason}" | custo=${call.cost ?? "n/a"} | duração=${call.durationSeconds ?? "n/a"}s`);
      updated++;
    }
  }

  console.log(`\n── Resumo ──────────────────────────────`);
  console.log(`  Atualizados:    ${updated}`);
  console.log(`  Ainda ativos:   ${stillActive}`);
  console.log(`  Pulados/erros:  ${skipped}`);
  console.log(`────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("✗ Erro fatal:", err);
  process.exit(1);
});
