import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-helper";

// GET /api/tenants — lista tenants do usuário (admins veem todos)
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (isAdminEmail(user.email)) {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data, error: dbError } = await service
      .from("tenants")
      .select("id, name, timezone, created_at")
      .order("created_at", { ascending: true });
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ tenants: data });
  }

  const { data, error: dbError } = await supabase
    .from("tenants")
    .select("id, name, timezone, created_at")
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ tenants: data });
}

// POST /api/tenants — cria tenant + membership owner
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { name, timezone = "America/Sao_Paulo" } = body;
  if (!name) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });

  // Usar service role para criar tenant + membership em transação
  const { createServiceClient } = await import("@/lib/supabase/service");
  const service = createServiceClient();

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({ name, timezone })
    .select()
    .single();

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });

  const { error: memberError } = await service
    .from("memberships")
    .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner" });

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ tenant }, { status: 201 });
}
