import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helper";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/tenants
// Retorna todos os tenants com estatísticas (só admins)
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const service = createServiceClient();

  // Buscar todos os tenants
  const { data: tenants, error } = await service
    .from("tenants")
    .select("id, name, timezone, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tenants || tenants.length === 0) return NextResponse.json({ tenants: [] });

  const tenantIds = tenants.map((t) => t.id);

  // Buscar contagens em paralelo
  const [
    { data: leadCounts },
    { data: callCounts },
    { data: queueCounts },
    { data: vapiConnections },
    { data: memberCounts },
    { data: activeCallLeads },
    { data: activeCampaigns },
  ] = await Promise.all([
    // Total de leads por tenant
    service
      .from("leads")
      .select("tenant_id")
      .in("tenant_id", tenantIds),
    // Total de chamadas por tenant
    service
      .from("call_records")
      .select("tenant_id")
      .in("tenant_id", tenantIds),
    // Filas por tenant (todas)
    service
      .from("dial_queues")
      .select("tenant_id, status")
      .in("tenant_id", tenantIds),
    // Vapi configurado por tenant
    service
      .from("vapi_connections")
      .select("tenant_id")
      .in("tenant_id", tenantIds)
      .eq("is_active", true),
    // Membros por tenant
    service
      .from("memberships")
      .select("tenant_id")
      .in("tenant_id", tenantIds),
    // Chamadas ativas agora (leads em discagem)
    service
      .from("leads")
      .select("tenant_id")
      .in("tenant_id", tenantIds)
      .eq("status", "calling"),
    // Campanhas running/paused com detalhes (para controle remoto no admin)
    service
      .from("dial_queues")
      .select("id, tenant_id, name, status, concurrency")
      .in("tenant_id", tenantIds)
      .in("status", ["running", "paused"]),
  ]);

  // Agregar por tenant
  const aggregated = tenants.map((t) => {
    const leads       = (leadCounts ?? []).filter((r) => r.tenant_id === t.id).length;
    const calls       = (callCounts ?? []).filter((r) => r.tenant_id === t.id).length;
    const queues      = (queueCounts ?? []).filter((r) => r.tenant_id === t.id);
    const running     = queues.filter((q) => q.status === "running").length;
    const totalQ      = queues.length;
    const vapiOk      = (vapiConnections ?? []).some((v) => v.tenant_id === t.id);
    const members     = (memberCounts ?? []).filter((m) => m.tenant_id === t.id).length;
    const activeCalls = (activeCallLeads ?? []).filter((r) => r.tenant_id === t.id).length;
    const campaigns   = (activeCampaigns ?? [])
      .filter((c) => c.tenant_id === t.id)
      .map((c) => ({ id: c.id, name: c.name, status: c.status, concurrency: c.concurrency }));

    return {
      ...t,
      stats: {
        leads,
        calls,
        queues:          totalQ,
        running_queues:  running,
        vapi_configured: vapiOk,
        members,
        active_calls:    activeCalls,
      },
      campaigns,
    };
  });

  return NextResponse.json({ tenants: aggregated });
}
