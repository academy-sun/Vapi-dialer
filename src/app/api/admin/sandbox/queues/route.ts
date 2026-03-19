import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helper";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/sandbox/queues?tenantId=xxx
// Retorna filas e listas de um tenant qualquer (só admins)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId obrigatório" }, { status: 400 });

  const service = createServiceClient();

  const [{ data: queues }, { data: lists }] = await Promise.all([
    service
      .from("dial_queues")
      .select("id, name, status, lead_list_id, assistant_id, phone_number_id, concurrency")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    service
      .from("lead_lists")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ queues: queues ?? [], lists: lists ?? [] });
}
