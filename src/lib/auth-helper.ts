import { createClient } from "./supabase/server";
import { NextResponse } from "next/server";
import { isAdminEmail } from "./admin-helper";
import { rateLimitApi } from "./rate-limit";

/**
 * Valida sessão + membership no tenant + rate limit por userId.
 * Admins do sistema (ADMIN_EMAILS) têm acesso a qualquer tenant sem membership.
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

  // Rate limiting por usuário autenticado: 600 req/min
  const rl = await rateLimitApi(user.id);
  if (!rl.allowed) {
    return {
      user: null,
      membership: null,
      response: NextResponse.json(
        { error: "Muitas requisições. Tente novamente em breve." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.resetInSeconds),
            "X-RateLimit-Remaining": "0",
          },
        }
      ),
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
