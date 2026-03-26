import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { Resend } from "resend";

type Params = { params: Promise<{ tenantId: string }> };

const ADMIN_EMAIL = "fabio@aceleradoramx3.com";

export async function POST(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { user, response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Serviço de e-mail não configurado (RESEND_API_KEY ausente)" }, { status: 503 });
  }

  const service = createServiceClient();

  // Buscar nome da empresa
  const { data: tenant } = await service
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  // Buscar dados de minutos
  const { data: conn } = await service
    .from("vapi_connections")
    .select("contracted_minutes, minutes_used_cache, minutes_cache_month")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  const tenantName        = tenant?.name ?? "Empresa sem nome";
  const contracted        = conn?.contracted_minutes ?? 0;
  const usedSeconds       = conn?.minutes_used_cache ?? 0;
  const usedMinutes       = Math.ceil(usedSeconds / 60);
  const month             = conn?.minutes_cache_month ?? new Date().toISOString().slice(0, 7);
  const pct               = contracted > 0 ? Math.round((usedMinutes / contracted) * 100) : 0;
  const requesterEmail    = user?.email ?? "desconhecido";

  // Formatar mês para exibição: "2026-03" → "Março/2026"
  const MONTHS: Record<string, string> = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março",
    "04": "Abril",   "05": "Maio",      "06": "Junho",
    "07": "Julho",   "08": "Agosto",    "09": "Setembro",
    "10": "Outubro", "11": "Novembro",  "12": "Dezembro",
  };
  const [year, monthNum] = month.split("-");
  const monthLabel = `${MONTHS[monthNum] ?? monthNum}/${year}`;

  const resend = new Resend(resendKey);

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@aceleradoramx3.com";

  const { error: emailError } = await resend.emails.send({
    from:    `CallX <${fromEmail}>`,
    to:      ADMIN_EMAIL,
    subject: `[CallX] Solicitação de mais minutos — ${tenantName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; border-radius: 8px;">
        <h2 style="margin: 0 0 8px; color: #111827; font-size: 20px;">Solicitação de minutos adicionais</h2>
        <p style="margin: 0 0 24px; color: #6b7280; font-size: 14px;">Um cliente está solicitando mais minutos para este mês.</p>

        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
          <tr>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #6b7280; width: 50%;">Empresa</td>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; font-weight: 600; color: #111827;">${tenantName}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #6b7280;">Mês de referência</td>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827;">${monthLabel}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #6b7280;">Minutos contratados</td>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827;">${contracted} min</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #6b7280;">Minutos utilizados</td>
            <td style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; font-weight: 600; color: ${pct >= 100 ? "#dc2626" : pct >= 80 ? "#d97706" : "#111827"};">${usedMinutes} min (${pct}%)</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; font-size: 13px; color: #6b7280;">Solicitante</td>
            <td style="padding: 14px 16px; font-size: 14px; color: #111827;">${requesterEmail}</td>
          </tr>
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
          CallX by MX3 — Sistema automático de notificação
        </p>
      </div>
    `,
  });

  if (emailError) {
    console.error("[request-minutes] Erro ao enviar e-mail:", emailError);
    return NextResponse.json({ error: "Falha ao enviar e-mail" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
