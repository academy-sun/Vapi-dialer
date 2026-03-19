import { createClient } from "./supabase/server";
import { NextResponse } from "next/server";

/**
 * Verifica se um email está na lista de admins do sistema.
 * Configure ADMIN_EMAILS no .env como lista separada por vírgula:
 * ADMIN_EMAILS=voce@email.com,parceiro@email.com
 */
export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  if (!raw.trim()) return false;
  const adminEmails = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Protege rotas de API do painel admin.
 * Retorna { user, response: null } se autorizado, ou { user: null, response } se negado.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 }),
    };
  }

  return { user, response: null };
}
