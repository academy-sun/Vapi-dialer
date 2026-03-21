import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// POST /api/tenants/:tenantId/lead-lists/:leadListId/import
// Body: multipart/form-data com campo "file" (CSV) e opcional "mappings" (JSON)
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response, user } = await requireTenantAccess(tenantId);
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

  // Limite de 50MB
  const MAX_CSV_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: 50MB.` },
      { status: 413 }
    );
  }

  // Ler mappings do wizard (se presente)
  let mappings: Record<string, string> = {};
  const mappingsRaw = formData.get("mappings");
  if (mappingsRaw && typeof mappingsRaw === "string") {
    try {
      mappings = JSON.parse(mappingsRaw);
    } catch {
      return NextResponse.json({ error: "mappings inválido" }, { status: 400 });
    }
  }

  const useMappings = Object.keys(mappings).length > 0;

  const rawText = await file.text();
  // Remove BOM (Excel UTF-8 salva com \uFEFF no início)
  const csvText = rawText.replace(/^\uFEFF/, "");
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV vazio ou sem dados" }, { status: 400 });
  }

  // Auto-detectar separador: Excel BR usa ";" por padrão
  const firstLine = lines[0];
  const sep =
    firstLine.includes(";") && firstLine.split(";").length > firstLine.split(",").length
      ? ";"
      : ",";

  const headersRaw = firstLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const headers = headersRaw.map((h) => h.toLowerCase());

  const toInsert: object[] = [];
  const errors: string[] = [];

  if (useMappings) {
    // ── Modo wizard: usar mapeamento customizado ────────────────────────────
    const phoneCol = Object.entries(mappings).find(([, v]) => v === "phone")?.[0];
    if (!phoneCol) {
      return NextResponse.json(
        { error: "Nenhuma coluna mapeada para phone" },
        { status: 400 }
      );
    }

    // Índice da coluna que foi mapeada para phone (comparação case-insensitive)
    const phoneIdx = headersRaw.findIndex(
      (h) => h.toLowerCase() === phoneCol.toLowerCase()
    );
    if (phoneIdx === -1) {
      return NextResponse.json(
        { error: `Coluna "${phoneCol}" não encontrada no CSV` },
        { status: 400 }
      );
    }

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
      headersRaw.forEach((origHeader, idx) => {
        if (idx === phoneIdx) return; // já é o phone
        const dest = mappings[origHeader];
        if (!dest || dest === "__ignore__") return;

        const val = cols[idx];
        if (!val) return;

        // Sempre salvar com o nome original da coluna (snake_case) para que
        // o prompt Vapi possa usar {{nome_da_coluna}} como variável diretamente.
        const snakeOrig = toSnakeCase(origHeader);
        dataJson[snakeOrig] = val;

        // Se o destino canônico for diferente do original, salvar também
        // (ex: "nome" → "name") para compatibilidade com filtros de exibição.
        if (dest !== "__custom__" && dest !== snakeOrig) {
          dataJson[dest] = val;
        }
      });

      toInsert.push({
        tenant_id: tenantId,
        lead_list_id: leadListId,
        phone_e164: parsed.format("E.164"),
        data_json: dataJson,
        status: "new",
      });
    }
  } else {
    // ── Modo legado: busca coluna phone por nome no header ──────────────────
    const phoneIdx = headers.findIndex(
      (h) => h === "phone" || h === "telefone" || h === "fone" || h === "celular"
    );
    if (phoneIdx === -1) {
      return NextResponse.json(
        {
          error: `Coluna de telefone não encontrada. O CSV deve ter uma coluna chamada "phone", "telefone", "fone" ou "celular". Colunas encontradas: ${headers.join(", ")}`,
        },
        { status: 400 }
      );
    }

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
      headersRaw.forEach((h, idx) => {
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
    errors: errors.slice(0, 20),
  });
}
