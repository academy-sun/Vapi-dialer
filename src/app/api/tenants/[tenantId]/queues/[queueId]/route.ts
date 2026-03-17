import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

// PATCH /api/tenants/:tenantId/queues/:queueId
// Edita campos da fila (name, assistant_id, phone_number_id, concurrency, max_attempts, webhook_url)
// Nota: lead_list_id e status não podem ser alterados via este endpoint
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Campos editáveis
  const allowed = ["name", "assistant_id", "phone_number_id", "concurrency", "max_attempts", "retry_delay_minutes", "webhook_url", "allowed_days", "allowed_time_window"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  if (updates.name !== undefined && !String(updates.name).trim()) {
    return NextResponse.json({ error: "name não pode ser vazio" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("dial_queues")
    .update(updates)
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });

  return NextResponse.json({ queue: data });
}

// DELETE /api/tenants/:tenantId/queues/:queueId
// Só permite deletar filas em status "draft" ou "stopped"
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Verificar status antes de deletar
  const { data: queue } = await service
    .from("dial_queues")
    .select("status")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  if (queue.status === "running" || queue.status === "paused") {
    return NextResponse.json({ error: "Pare a fila antes de deletar" }, { status: 409 });
  }

  const { error } = await service
    .from("dial_queues")
    .delete()
    .eq("id", queueId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
