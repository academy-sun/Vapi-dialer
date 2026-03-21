import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  const { data: queue } = await service
    .from("dial_queues")
    .select("webhook_url, name")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });

  if (!queue.webhook_url) {
    return NextResponse.json({ error: "Nenhuma webhook_url configurada nesta fila." }, { status: 400 });
  }

  const testPayload = {
    event:       "webhook.test",
    fired_at:    new Date().toISOString(),
    tenant_id:   tenantId,
    queue_id:    queueId,
    queue_name:  queue.name,
    message:     "Este é um teste do webhook da fila de discagem Vapi Dialer. Se você recebeu isso, a conexão está funcionando!",
    lead: {
      phone_e164: "+5511999999999",
      data:       { name: "Teste Webhook" },
    },
    call: {
      vapi_call_id:     "test-call-id",
      ended_reason:     "customer-ended-call",
      duration_seconds: 120,
      duration_minutes: 2,
    },
    structured_outputs: {
      interesse:               "sucesso",
      resumo:                  "Chamada de teste para validar a integração com o webhook.",
      "Performance Global Score": 100,
    },
  };

  const start = Date.now();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(queue.webhook_url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(testPayload),
      signal:  AbortSignal.timeout(10_000),
    });

    httpStatus    = res.status;
    responseBody  = await res.text().catch(() => null);
    const elapsed = Date.now() - start;

    if (res.ok) {
      return NextResponse.json({
        ok:       true,
        status:   httpStatus,
        elapsed_ms: elapsed,
        message:  `Webhook enviado com sucesso! Status HTTP ${httpStatus} em ${elapsed}ms.`,
        response: responseBody,
      });
    } else {
      return NextResponse.json({
        ok:       false,
        status:   httpStatus,
        elapsed_ms: elapsed,
        message:  `Webhook enviado mas o destino retornou HTTP ${httpStatus}.`,
        response: responseBody,
      }, { status: 200 }); // 200 aqui pois o erro é do destino, não nosso
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    const elapsed = Date.now() - start;
    return NextResponse.json({
      ok:       false,
      status:   null,
      elapsed_ms: elapsed,
      message:  `Falha ao conectar com o webhook: ${errorMessage}`,
      response: null,
    }, { status: 200 });
  }
}
