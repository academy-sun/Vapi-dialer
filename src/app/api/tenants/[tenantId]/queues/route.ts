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
    max_daily_attempts = 0,
    webhook_url = null,
    allowed_days,
    allowed_time_window,
  } = body;

  if (!name || !assistant_id || !phone_number_id || !lead_list_id) {
    return NextResponse.json(
      { error: "name, assistant_id, phone_number_id e lead_list_id são obrigatórios" },
      { status: 400 }
    );
  }

  const safeConc    = Math.min(5, Math.max(1, parseInt(String(concurrency))    || 3));
  const safeAttempt = Math.min(10, Math.max(1, parseInt(String(max_attempts))  || 3));
  const safeDelay   = Math.min(1440, Math.max(1, parseInt(String(retry_delay_minutes)) || 30));
  const safeDaily   = Math.max(0, parseInt(String(max_daily_attempts)) || 0);

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
      concurrency:          safeConc,
      max_attempts:         safeAttempt,
      retry_delay_minutes:  safeDelay,
      max_daily_attempts:   safeDaily,
      webhook_url,
      ...(allowed_days         !== undefined && { allowed_days }),
      ...(allowed_time_window  !== undefined && { allowed_time_window }),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queue: data }, { status: 201 });
}
