import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/lead-lists
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_lists")
    .select("id, name, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leadLists: data });
}

// POST /api/tenants/:tenantId/lead-lists
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const { name } = body;
  if (!name) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_lists")
    .insert({ tenant_id: tenantId, name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leadList: data }, { status: 201 });
}
