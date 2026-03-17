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
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const offset = (page - 1) * limit;

  const service = createServiceClient();
  const { data, error, count } = await service
    .from("leads")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", leadListId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data, total: count, page, limit });
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
  const data_json: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraFields)) {
    if (v && typeof v === "string" && v.trim()) {
      data_json[k] = v.trim();
    }
  }

  const { data, error } = await service
    .from("leads")
    .insert({
      tenant_id:    tenantId,
      lead_list_id: leadListId,
      phone_e164:   parsed.format("E.164"),
      data_json,
      status:       "new",
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
