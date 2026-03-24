import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

const VAPI_BASE_URL = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

export async function POST(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Buscar fila com campos necessários para validação
  const { data: queue } = await service
    .from("dial_queues")
    .select("lead_list_id, status, assistant_id, phone_number_id")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Queue não encontrada" }, { status: 404 });

  // ── Validação prévia de config Vapi ──────────────────────────────────────────
  // Se a chave Vapi estiver configurada, verifica se assistente e número existem.
  // Bloqueia o start se qualquer recurso retornar 404 — evita queimar tentativas
  // de todos os leads por uma config inválida.
  const { data: vapiConn } = await service
    .from("vapi_connections")
    .select("encrypted_private_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (vapiConn?.encrypted_private_key) {
    try {
      const vapiKey = decrypt(vapiConn.encrypted_private_key);

      const [assistantRes, phoneRes] = await Promise.all([
        fetch(`${VAPI_BASE_URL}/assistant/${queue.assistant_id}`, {
          headers: { Authorization: `Bearer ${vapiKey}` },
          signal: AbortSignal.timeout(8_000),
        }),
        fetch(`${VAPI_BASE_URL}/phone-number/${queue.phone_number_id}`, {
          headers: { Authorization: `Bearer ${vapiKey}` },
          signal: AbortSignal.timeout(8_000),
        }),
      ]);

      if (assistantRes.status === 404) {
        return NextResponse.json(
          {
            error: `Assistente não encontrado no Vapi (ID: ${queue.assistant_id}). ` +
              `Ele pode ter sido deletado. Edite a campanha e selecione um assistente válido.`,
          },
          { status: 422 }
        );
      }

      if (phoneRes.status === 404) {
        return NextResponse.json(
          {
            error: `Número de telefone não encontrado no Vapi (ID: ${queue.phone_number_id}). ` +
              `Ele pode ter sido removido. Edite a campanha e selecione um número válido.`,
          },
          { status: 422 }
        );
      }
    } catch (err) {
      // Timeout ou falha de rede ao validar — não bloquear o start, apenas logar
      console.warn(
        `[start] Não foi possível validar config Vapi para fila ${queueId}: ` +
        `${err instanceof Error ? err.message : String(err)} — iniciando sem validação`
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const previousStatus = queue.status;

  // Ativar fila — múltiplas campanhas do mesmo tenant podem rodar simultaneamente
  // last_error é limpo ao reiniciar para não exibir banner de erro obsoleto
  const { error } = await service
    .from("dial_queues")
    .update({ status: "running", last_error: null })
    .eq("id", queueId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date().toISOString();

  // Marcar leads novos como queued
  await service
    .from("leads")
    .update({ status: "queued" })
    .eq("lead_list_id", queue.lead_list_id)
    .eq("tenant_id", tenantId)
    .eq("status", "new");

  // Ao retomar de pausa: limpar next_attempt_at vencido para processamento imediato
  await service
    .from("leads")
    .update({ next_attempt_at: null })
    .eq("lead_list_id", queue.lead_list_id)
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", now);

  // Ao reiniciar uma fila parada: recolocar leads com falha na fila para nova tentativa
  if (previousStatus === "stopped") {
    await service
      .from("leads")
      .update({ status: "queued", next_attempt_at: null })
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId)
      .eq("status", "failed");
  }

  return NextResponse.json({ ok: true, status: "running" });
}
