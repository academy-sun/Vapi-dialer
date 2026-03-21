import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type Params = { params: Promise<{ tenantId: string; listId: string }> };

/**
 * POST /api/webhooks/leads/:tenantId/:listId
 *
 * Recebe um lead via JSON de sistemas externos (CRM, n8n, Zapier, formulários, etc.)
 * e o insere na lista de leads informada.
 *
 * Autenticação: Bearer token no header Authorization OU query param ?secret=xxx
 * O secret deve bater com lead_lists.webhook_secret configurado na lista.
 * Se a lista não tiver webhook_secret configurado, qualquer requisição é aceita
 * (útil para testes — configure o secret em produção).
 *
 * Body (application/json):
 *   { "phone": "+5511999990001", "name": "João", "company": "Acme", ...outros campos }
 *
 * Resposta 201: { "lead": { id, phone_e164, status, ... } }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, listId } = await params;


  const service = createServiceClient();

  // Buscar a lista e seu webhook_secret
  const { data: list, error: listError } = await service
    .from("lead_lists")
    .select("id, name, webhook_secret")
    .eq("id", listId)
    .eq("tenant_id", tenantId)
    .single();

  if (listError || !list) {
    return NextResponse.json({ error: "Lista de leads não encontrada" }, { status: 404 });
  }

  // Validar secret se a lista tiver um configurado
  if (list.webhook_secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const querySecret = new URL(req.url).searchParams.get("secret") ?? "";
    const providedSecret = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : querySecret;

    if (providedSecret !== list.webhook_secret) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  // Parsear body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no body" }, { status: 400 });
  }

  // Suportar variações de nome do campo telefone
  const rawPhone = (
    body.phone ?? body.telefone ?? body.fone ?? body.celular ?? ""
  ) as string;

  if (!rawPhone?.trim()) {
    return NextResponse.json(
      { error: "Campo 'phone' é obrigatório (aceita também: telefone, fone, celular)" },
      { status: 400 }
    );
  }

  const parsed = parsePhoneNumberFromString(rawPhone.trim(), "BR");
  if (!parsed || !parsed.isValid()) {
    return NextResponse.json(
      { error: `Telefone inválido: "${rawPhone}". Use formato E.164 (+5511999990001) ou nacional (11999990001)` },
      { status: 400 }
    );
  }

  // Campos extras (exceto o telefone) vão para data_json
  const phoneFields = new Set(["phone", "telefone", "fone", "celular"]);
  const data_json: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!phoneFields.has(k) && v !== null && v !== undefined) {
      data_json[k] = String(v).trim();
    }
  }

  // Verificar se há fila ativa (running) para esta lista.
  // Se sim, o lead já entra como "queued" para ser processado imediatamente pelo worker.
  const { data: activeQueue } = await service
    .from("dial_queues")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", listId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const leadStatus = activeQueue ? "queued" : "new";

  const { data: lead, error: insertError } = await service
    .from("leads")
    .insert({
      tenant_id:    tenantId,
      lead_list_id: listId,
      phone_e164:   parsed.format("E.164"),
      data_json,
      status:       leadStatus,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: `Telefone ${parsed.format("E.164")} já existe nesta lista` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    lead,
    queued: leadStatus === "queued",
    message: activeQueue
      ? "Lead inserido e colocado na fila para discagem imediata"
      : "Lead inserido. Inicie uma fila de discagem para ligar.",
  }, { status: 201 });
}
