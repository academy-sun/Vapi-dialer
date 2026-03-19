import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helper";
import { createServiceClient } from "@/lib/supabase/service";
import axios, { AxiosError } from "axios";
import crypto from "crypto";

const VAPI_BASE_URL  = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY_BASE64!;

function decryptAesGcm(cipherText: string): string {
  const key     = Buffer.from(ENCRYPTION_KEY, "base64");
  const payload = JSON.parse(Buffer.from(cipherText, "base64").toString("utf8"));
  const iv      = Buffer.from(payload.iv,   "base64");
  const tag     = Buffer.from(payload.tag,  "base64");
  const data    = Buffer.from(payload.data, "base64");
  const dec     = crypto.createDecipheriv("aes-256-gcm", key, iv) as crypto.DecipherGCM;
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

// POST /api/admin/sandbox/call
// Body: { tenantId, queueId, phone, dryRun? }
// Dispara uma chamada de teste pelo Vapi (ou só valida com dryRun=true)
export async function POST(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  let body: { tenantId?: string; queueId?: string; phone?: string; dryRun?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { tenantId, queueId, phone, dryRun = false } = body;
  if (!tenantId || !queueId || !phone) {
    return NextResponse.json({ error: "tenantId, queueId e phone são obrigatórios" }, { status: 400 });
  }

  const service = createServiceClient();

  // Buscar fila
  const { data: queue } = await service
    .from("dial_queues")
    .select("id, name, assistant_id, phone_number_id, tenant_id")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });

  // Buscar chave Vapi
  const { data: vapiConn } = await service
    .from("vapi_connections")
    .select("encrypted_private_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!vapiConn) return NextResponse.json({ error: "Chave Vapi não configurada para este tenant" }, { status: 400 });

  let vapiKey: string;
  try { vapiKey = decryptAesGcm(vapiConn.encrypted_private_key); }
  catch { return NextResponse.json({ error: "Falha ao descriptografar chave Vapi" }, { status: 500 }); }

  // Resumo do que seria feito
  const summary = {
    tenant_id:      tenantId,
    queue:          queue.name,
    assistant_id:   queue.assistant_id,
    phone_number_id: queue.phone_number_id,
    target_phone:   phone,
    dry_run:        dryRun,
  };

  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, summary, message: "Simulação concluída — nenhuma chamada foi feita." });
  }

  // Disparar chamada real
  try {
    const { data } = await axios.post(
      `${VAPI_BASE_URL}/call/phone`,
      {
        assistantId:   queue.assistant_id,
        phoneNumberId: queue.phone_number_id,
        customer:      { number: phone },
        assistantOverrides: {
          variableValues: { phone, phone_e164: phone, sandbox: "true" },
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      },
    );

    return NextResponse.json({ ok: true, dry_run: false, summary, vapi_call_id: data.id, vapi_status: data.status });
  } catch (err) {
    const axErr   = err instanceof AxiosError ? err : null;
    const status  = axErr?.response?.status ?? 500;
    const message = axErr?.response?.data ? JSON.stringify(axErr.response.data) : String(err);
    return NextResponse.json({ ok: false, error: message, summary }, { status });
  }
}
