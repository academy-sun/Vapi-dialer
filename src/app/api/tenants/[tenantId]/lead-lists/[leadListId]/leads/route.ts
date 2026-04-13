import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

// GET /api/tenants/:tenantId/lead-lists/:leadListId/leads
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const url = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page")  ?? "1");
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const offset = (page - 1) * limit;

  const service = createServiceClient();
  let query = service.from("leads").select("*, call_records(id, duration_seconds, ended_reason)", { count: "exact" });

  if (search) {
    query = service.rpc("search_leads", {
      p_tenant_id:    tenantId,
      p_lead_list_id: leadListId,
      p_search:       search,
      p_limit:        limit,
      p_offset:       offset,
    }).select("*, call_records(id, duration_seconds, ended_reason)", { count: "exact" });
  } else {
    query = query
      .eq("tenant_id", tenantId)
      .eq("lead_list_id", leadListId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
  }

  // Filtros suportados
  const statusFilter = url.searchParams.get("status");
  if (statusFilter) query = query.eq("status", statusFilter);

  const attemptsStr = url.searchParams.get("attempt_count");
  if (attemptsStr) query = query.eq("attempt_count", parseInt(attemptsStr));

  const answeredStr = url.searchParams.get("answered");
  if (answeredStr === "yes") {
    query = query.in("last_outcome", ["customer-ended-call", "assistant-ended-call", "exceeded-max-duration"]);
  } else if (answeredStr === "no") {
    query = query.not("last_outcome", "in", '("customer-ended-call", "assistant-ended-call", "exceeded-max-duration")');
  }

  const scheduledStr = url.searchParams.get("scheduled");
  if (scheduledStr === "yes") {
    query = query.not("next_attempt_at", "is", null);
  } else if (scheduledStr === "no") {
    query = query.is("next_attempt_at", null);
  }

  const minDuration = url.searchParams.get("min_duration");
  if (minDuration) {
    // Para filtrar por duration de call_records no Supabase via joins 1-to-many,
    // devemos forçar um recarregamento via RPC se complexo, ou aplicar !inner() nas FKs,
    // Mas postgrest não suporta filtrar pai por campo de filho num 1-to-N nativamente.
    // Assim, se min_duration vier, usaremos fetch e filtraremos no back-end (pois não temos limites tão extremos no staging), ou deixaremos para o frontend se preferir.
    // Para contornar rápido em Supabase, passamos a inner join no call_records:
    // query.not('call_records', 'is', null).gte('call_records.duration_seconds', minDuration)
    // Infelizmente o supabase JS client p/ 1toN é chato com inner. 
    // Faremos apenas o fetch e retornamos no corpo.
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Filtrar pós query caso venha minDuration (limitação do postgrest rpc/join)
  let resultData = data || [];
  if (minDuration) {
    const md = parseInt(minDuration);
    resultData = resultData.filter(l => {
      const crs = l.call_records || [];
      return crs.some((cr: any) => cr.duration_seconds >= md);
    });
  }

  return NextResponse.json({ leads: resultData, total: count, page, limit });
}

// POST /api/tenants/:tenantId/lead-lists/:leadListId/leads
// Body: { phone: string, name?: string, company?: string, [key: string]: string }
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Verificar que lead_list pertence ao tenant
  const { data: list, error: listError } = await service
    .from("lead_lists")
    .select("id")
    .eq("id", leadListId)
    .eq("tenant_id", tenantId)
    .single();

  if (listError || !list) {
    return NextResponse.json({ error: "Lead list não encontrada" }, { status: 404 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no body" }, { status: 400 });
  }

  const { phone, ...extraFields } = body;

  if (!phone?.trim()) {
    return NextResponse.json({ error: "Campo 'phone' é obrigatório" }, { status: 400 });
  }

  // Valida e normaliza: aceita formatos BR com ou sem +55, com ou sem máscara
  const parsed = parsePhoneNumberFromString(phone.trim(), "BR");
  if (!parsed || !parsed.isValid()) {
    return NextResponse.json(
      { error: `Telefone inválido: "${phone}". Use +55 (11) 99999-9999 ou 11999990001` },
      { status: 400 }
    );
  }

  // Campos extras (name, company, etc.) vão para data_json
  // Campos de nome truncados a 40 chars (limite do campo customer.name do Vapi)
  const NAME_FIELDS = new Set(["name", "nome", "first_name", "primeiro_nome", "last_name", "sobrenome", "razao_social"]);
  const data_json: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraFields)) {
    if (v && typeof v === "string" && v.trim()) {
      const val = v.trim();
      data_json[k] = (NAME_FIELDS.has(k.toLowerCase()) && val.length > 40)
        ? val.substring(0, 37) + "..."
        : val;
    }
  }

  // Se houver fila ativa (running) para esta lista, inserir já como "queued"
  const { data: activeQueue } = await service
    .from("dial_queues")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", leadListId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const leadStatus = activeQueue ? "queued" : "new";

  const { data, error } = await service
    .from("leads")
    .insert({
      tenant_id:    tenantId,
      lead_list_id: leadListId,
      phone_e164:   parsed.format("E.164"),
      data_json,
      status:       leadStatus,
    })
    .select()
    .single();

  if (error) {
    // Violação de unique: mesmo telefone na mesma lista
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Telefone ${parsed.format("E.164")} já existe nesta lista` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data }, { status: 201 });
}
