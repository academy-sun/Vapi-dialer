import { createClient } from "./supabase/server";
import { NextResponse } from "next/server";
import { isAdminEmail } from "./admin-helper";

/**
 * Valida sessão + membership no tenant.
 * Admins do sistema (ADMIN_EMAILS) têm acesso a qualquer tenant sem membership.
 * Nota: rate limiting via Redis foi removido do auth-helper para não incluir
 * ioredis (Node.js-only) no bundle do middleware do Next.js (Edge runtime).
 */
export async function requireTenantAccess(tenantId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    return {
      user: null,
      membership: null,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  // Admins do sistema têm acesso irrestrito a qualquer tenant
  if (isAdminEmail(user.email)) {
    return { user, membership: { id: "admin", role: "owner" as const }, response: null };
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return {
      user: null,
      membership: null,
      response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }),
    };
  }

  return { user, membership, response: null };
}
