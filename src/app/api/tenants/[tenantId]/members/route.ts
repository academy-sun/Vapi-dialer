import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/members — lista membros do tenant
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response, membership } = await requireTenantAccess(tenantId);
  if (response) return response;

  // Só owner e admin podem ver membros
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const service = createServiceClient();

  const { data, error } = await service
    .from("memberships")
    .select("id, role, created_at, user_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Buscar emails dos usuários
  const { data: { users }, error: usersError } = await service.auth.admin.listUsers();

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.id, u.email])
  );

  const members = (data ?? []).map(m => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    email: userMap[m.user_id] ?? "—",
    created_at: m.created_at,
  }));

  return NextResponse.json({ members });
}

// POST /api/tenants/:tenantId/members — cria usuário + membership
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response, membership } = await requireTenantAccess(tenantId);
  if (response) return response;

  // Só owner e admin podem criar membros
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let body: { email?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { email, password, role = "member" } = body;

  if (!email?.trim()) return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "senha deve ter no mínimo 6 caracteres" }, { status: 400 });
  if (!["member", "admin"].includes(role)) return NextResponse.json({ error: "role inválido" }, { status: 400 });

  const service = createServiceClient();

  // Verificar se email já existe como membro deste tenant
  const { data: { users } } = await service.auth.admin.listUsers();
  const existingUser = users?.find(u => u.email === email.trim().toLowerCase());

  let userId: string;

  if (existingUser) {
    // Usuário já existe no Supabase Auth — só adicionar membership
    userId = existingUser.id;

    // Verificar se já é membro deste tenant
    const { data: existingMembership } = await service
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .single();

    if (existingMembership) {
      return NextResponse.json(
        { error: "Este email já é membro deste tenant" },
        { status: 409 }
      );
    }
  } else {
    // Criar novo usuário no Supabase Auth
    const { data: newUser, error: createError } = await service.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // confirmar email automaticamente — sem precisar de verificação
    });

    if (createError || !newUser.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Erro ao criar usuário" },
        { status: 500 }
      );
    }

    userId = newUser.user.id;
  }

  // Criar membership
  const { data: newMembership, error: memberError } = await service
    .from("memberships")
    .insert({ tenant_id: tenantId, user_id: userId, role })
    .select()
    .single();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({
    member: {
      id: newMembership.id,
      user_id: userId,
      email: email.trim().toLowerCase(),
      role,
      created_at: newMembership.created_at,
    }
  }, { status: 201 });
}

// PATCH /api/tenants/:tenantId/members — atualiza role de um membro
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response, membership } = await requireTenantAccess(tenantId);
  if (response) return response;

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let body: { userId?: string; role?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { userId, role } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!role || !["member", "admin"].includes(role)) {
    return NextResponse.json({ error: "role inválido" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("memberships")
    .update({ role })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/tenants/:tenantId/members?userId=xxx — remove membership
export async function DELETE(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response, membership, user } = await requireTenantAccess(tenantId);
  if (response) return response;

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });

  // Não pode remover a si mesmo
  if (userId === user!.id) {
    return NextResponse.json({ error: "Você não pode remover seu próprio acesso" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("memberships")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
