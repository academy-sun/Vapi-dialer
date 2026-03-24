import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

interface LeadInput {
  phone_e164: string;
  data_json?: Record<string, string>;
}

// POST /api/tenants/:tenantId/lead-lists/from-calls
// Cria uma nova lista de leads a partir de um conjunto de chamadas filtradas.
// Body: { name: string; leads: LeadInput[] }
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const { name, leads } = body as { name: string; leads: LeadInput[] };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "leads não pode ser vazio" }, { status: 400 });
  }

  const service = createServiceClient();

  // Criar a nova lista
  const { data: list, error: listErr } = await service
    .from("lead_lists")
    .insert({ tenant_id: tenantId, name: name.trim() })
    .select("id")
    .single();

  if (listErr || !list) {
    return NextResponse.json({ error: listErr?.message ?? "Erro ao criar lista" }, { status: 500 });
  }

  // Deduplicar por phone_e164 (pode haver chamadas duplicadas do mesmo lead)
  const seen = new Set<string>();
  const unique = leads.filter((l) => {
    if (!l.phone_e164 || seen.has(l.phone_e164)) return false;
    seen.add(l.phone_e164);
    return true;
  });

  // Inserir em lotes de 100
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100).map((l) => ({
      tenant_id:    tenantId,
      lead_list_id: list.id,
      phone_e164:   l.phone_e164,
      data_json:    l.data_json ?? {},
      status:       "new",
    }));
    const { error: insErr } = await service.from("leads").insert(batch);
    if (insErr && insErr.code !== "23505") {
      // rollback: deletar a lista criada para não deixar lixo
      await service.from("lead_lists").delete().eq("id", list.id);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    inserted += batch.length;
  }

  return NextResponse.json({ leadListId: list.id, imported: inserted }, { status: 201 });
}
