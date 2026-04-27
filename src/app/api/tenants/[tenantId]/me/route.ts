import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/me
// Retorna o papel efetivo do usuário neste tenant.
// Admin global (ADMIN_EMAILS) é resolvido para "owner" mesmo sem row em memberships.
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { membership, response } = await requireTenantAccess(tenantId);
  if (response) return response;

  return NextResponse.json({ role: membership?.role ?? "member" });
}
