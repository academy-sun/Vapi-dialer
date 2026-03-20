import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

// POST /api/tenants/:tenantId/lead-lists/:leadListId/import
// Body: multipart/form-data com campo "file" (CSV)
// CSV deve ter coluna "phone" (obrigatória) + quaisquer outras (ficam em data_json)
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Verificar que lead_list pertence ao tenant
  const { data: list, error: listError } = await service
    .from("lead_lists")
    .select("id")
    .eq("id", leadListId)
    .eq("tenant_id", tenantId)
    .single();

  if (listError || !list) {
    return NextResponse.json({ error: "Lead list não encontrada" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });

  // Limite de 50MB para evitar OOM crash
  const MAX_CSV_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: 50MB.` },
      { status: 413 }
    );
  }

  const rawText = await file.text();
  // Remove BOM (Excel UTF-8 salva com \uFEFF no início)
  const csvText = rawText.replace(/^\uFEFF/, "");
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV vazio ou sem dados" }, { status: 400 });
  }

  // Auto-detectar separador: Excel BR usa ";" por padrão, internacional usa ","
  const firstLine = lines[0];
  const sep = firstLine.includes(";") && firstLine.split(";").length > firstLine.split(",").length
    ? ";"
    : ",";

  const headers = firstLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const phoneIdx = headers.findIndex((h) => h === "phone" || h === "telefone" || h === "fone" || h === "celular");
  if (phoneIdx === -1) {
    return NextResponse.json({
      error: `Coluna de telefone não encontrada. O CSV deve ter uma coluna chamada "phone", "telefone", "fone" ou "celular". Colunas encontradas: ${headers.join(", ")}`,
    }, { status: 400 });
  }

  // Recriar headers com capitalização original para data_json
  const headersOriginal = firstLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));

  const toInsert: object[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const rawPhone = cols[phoneIdx];
    if (!rawPhone) continue;

    const parsed = parsePhoneNumberFromString(rawPhone, "BR");
    if (!parsed || !parsed.isValid()) {
      errors.push(`Linha ${i + 1}: telefone inválido "${rawPhone}"`);
      continue;
    }

    const dataJson: Record<string, string> = {};
    headersOriginal.forEach((h, idx) => {
      if (idx !== phoneIdx && cols[idx]) dataJson[h] = cols[idx];
    });

    toInsert.push({
      tenant_id: tenantId,
      lead_list_id: leadListId,
      phone_e164: parsed.format("E.164"),
      data_json: dataJson,
      status: "new",
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    // Inserir em lotes de 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error: insertError } = await service.from("leads").insert(batch);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      inserted += batch.length;
    }
  }

  return NextResponse.json({
    imported: inserted,
    skipped: errors.length,
    errors: errors.slice(0, 20), // retornar até 20 erros
  });
}
