import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/queues
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("dial_queues")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queues: data });
}

// POST /api/tenants/:tenantId/queues
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const {
    name,
    assistant_id,
    phone_number_id,
    lead_list_id,
    concurrency = 3,
    max_attempts = 3,
    retry_delay_minutes = 30,
  } = body;

  if (!name || !assistant_id || !phone_number_id || !lead_list_id) {
    return NextResponse.json(
      { error: "name, assistant_id, phone_number_id e lead_list_id são obrigatórios" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("dial_queues")
    .insert({
      tenant_id: tenantId,
      name,
      assistant_id,
      phone_number_id,
      lead_list_id,
      status: "draft",
      concurrency,
      max_attempts,
      retry_delay_minutes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queue: data }, { status: 201 });
}
