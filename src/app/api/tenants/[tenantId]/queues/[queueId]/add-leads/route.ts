import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

/**
 * POST /api/tenants/:tenantId/queues/:queueId/add-leads
 *
 * Copia leads de uma lista de origem (sourceListId) para a lista vinculada
 * à campanha (queue.lead_list_id), ignorando duplicatas por telefone.
 *
 * Body: { sourceListId: string }
 * Response: { added: number; skipped: number }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  let body: { sourceListId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { sourceListId } = body;
  if (!sourceListId) {
    return NextResponse.json({ error: "sourceListId é obrigatório" }, { status: 400 });
  }

  const service = createServiceClient();

  // Buscar a campanha e sua lista vinculada
  const { data: queue } = await service
    .from("dial_queues")
    .select("id, name, lead_list_id")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  // Validar que a lista de origem pertence ao tenant
  const { data: sourceList } = await service
    .from("lead_lists")
    .select("id, name")
    .eq("id", sourceListId)
    .eq("tenant_id", tenantId)
    .single();

  if (!sourceList) {
    return NextResponse.json({ error: "Lista de origem não encontrada" }, { status: 404 });
  }

  // Não permitir incluir a própria lista da campanha nela mesma
  if (sourceListId === queue.lead_list_id) {
    return NextResponse.json(
      { error: "A lista de origem já é a lista desta campanha" },
      { status: 409 }
    );
  }

  // Buscar todos os leads da lista de origem (em lotes)
  const sourceLeads: Array<{ phone_e164: string; data_json: Record<string, unknown> }> = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await service
      .from("leads")
      .select("phone_e164, data_json")
      .eq("lead_list_id", sourceListId)
      .eq("tenant_id", tenantId)
      .range(offset, offset + BATCH - 1);
    if (error || !data || data.length === 0) break;
    sourceLeads.push(...data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  if (sourceLeads.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0, message: "Lista de origem está vazia" });
  }

  // Buscar telefones já existentes na lista da campanha (deduplicação)
  const existingPhones = new Set<string>();
  offset = 0;
  while (true) {
    const { data, error } = await service
      .from("leads")
      .select("phone_e164")
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId)
      .range(offset, offset + BATCH - 1);
    if (error || !data || data.length === 0) break;
    data.forEach((r) => existingPhones.add(r.phone_e164));
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  // Filtrar apenas leads novos
  const toInsert = sourceLeads.filter((l) => !existingPhones.has(l.phone_e164));
  const skipped = sourceLeads.length - toInsert.length;

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0, skipped, message: "Todos os leads já existem na campanha" });
  }

  // Verificar se há fila ativa para definir status inicial
  const leadStatus = queue.id ? "queued" : "new";

  // Inserir em lotes de 100
  let added = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100).map((l) => ({
      tenant_id:    tenantId,
      lead_list_id: queue.lead_list_id,
      phone_e164:   l.phone_e164,
      data_json:    l.data_json,
      status:       leadStatus,
    }));
    const { error } = await service.from("leads").insert(batch);
    if (error) {
      if (error.code === "23505") continue; // race condition — ignorar duplicata
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    added += batch.length;
  }

  return NextResponse.json({ added, skipped });
}
