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

  // Contagens reais por tenant (SELECT COUNT(*)) — evita o teto de 1.000 rows do PostgREST
  const [
    leadCountResults,
    callCountResults,
    activeCallResults,
    { data: queueCounts },
    { data: vapiConnections },
    { data: memberCounts },
    { data: activeCampaigns },
  ] = await Promise.all([
    // COUNT exato de leads por tenant (sem fetch de linhas)
    Promise.all(
      tenantIds.map((id) =>
        service
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", id)
      )
    ),
    // COUNT exato de chamadas por tenant
    Promise.all(
      tenantIds.map((id) =>
        service
          .from("call_records")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", id)
      )
    ),
    // COUNT de leads em discagem agora (status=calling) — tipicamente < 50, count exato por segurança
    Promise.all(
      tenantIds.map((id) =>
        service
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", id)
          .eq("status", "calling")
      )
    ),
    // Filas por tenant (baixo volume — sem risco de teto)
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
    // Campanhas running/paused com detalhes (para controle remoto no admin)
    service
      .from("dial_queues")
      .select("id, tenant_id, name, status, concurrency")
      .in("tenant_id", tenantIds)
      .in("status", ["running", "paused"]),
  ]);

  // Mapas tenant_id → contagem real
  const leadCountByTenant: Record<string, number>       = {};
  const callCountByTenant: Record<string, number>       = {};
  const activeCallByTenant: Record<string, number>      = {};
  tenantIds.forEach((id, i) => {
    leadCountByTenant[id]  = leadCountResults[i].count  ?? 0;
    callCountByTenant[id]  = callCountResults[i].count  ?? 0;
    activeCallByTenant[id] = activeCallResults[i].count ?? 0;
  });

  // Agregar por tenant
  const aggregated = tenants.map((t) => {
    const leads       = leadCountByTenant[t.id]  ?? 0;
    const calls       = callCountByTenant[t.id]  ?? 0;
    const queues      = (queueCounts ?? []).filter((r) => r.tenant_id === t.id);
    const running     = queues.filter((q) => q.status === "running").length;
    const totalQ      = queues.length;
    const vapiOk      = (vapiConnections ?? []).some((v) => v.tenant_id === t.id);
    const members     = (memberCounts ?? []).filter((m) => m.tenant_id === t.id).length;
    const activeCalls = activeCallByTenant[t.id] ?? 0;
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
