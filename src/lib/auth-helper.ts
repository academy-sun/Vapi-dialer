import { createClient } from "./supabase/server";
import { NextResponse } from "next/server";

/**
 * Valida sessão + membership no tenant.
 * Retorna { user, error } — se error != null, retorne o NextResponse direto.
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
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
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
      response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }),
    };
  }

  return { user, membership, response: null };
}
