/**
 * Parser determinístico de expressões de callback em PT-BR.
 * Sem dependência de chrono-node — regex + heurísticas explícitas.
 */
import { DateTime } from "luxon";

export interface ParseCallbackResult {
  ok: boolean;
  callbackAtIso: string | null;
  confidence: "high" | "medium" | "low";
  explanation: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  candidates?: string[];
}

const DEFAULT_TZ = "America/Sao_Paulo";

/** Normaliza texto: lowercase, remove acentos, trim */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function setTime(dt: DateTime, hour: number, minute = 0): DateTime {
  return dt.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Próximo dia útil (seg-sex) às 09:00 */
function nextBusinessDay9am(now: DateTime, tz: string): DateTime {
  let d = now.setZone(tz).plus({ days: 1 });
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return setTime(d, 9);
}

export function parseCallbackTime(
  text: string,
  timezone: string = DEFAULT_TZ,
  nowIso?: string
): ParseCallbackResult {
  const tz = timezone || DEFAULT_TZ;
  const now = nowIso ? DateTime.fromISO(nowIso, { zone: tz }) : DateTime.now().setZone(tz);
  const n = normalize(text);

  // ── 1. "daqui X horas" / "em X horas" ──
  const horasMatch = n.match(/(?:daqui|em|de|dentro de)\s+(\d+(?:[,\.]\d+)?)\s*h(?:ora(?:s)?)?/);
  if (horasMatch) {
    const hours = parseFloat(horasMatch[1].replace(",", "."));
    const target = now.plus({ hours });
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "high",
      explanation: `Callback em ${hours}h → ${target.toFormat("HH:mm 'de' dd/MM")} (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 2. "daqui X minutos" ──
  const minsMatch = n.match(/(?:daqui|em|de|dentro de)\s+(\d+)\s*min(?:uto(?:s)?)?/);
  if (minsMatch) {
    const minutes = parseInt(minsMatch[1], 10);
    const target = now.plus({ minutes });
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "high",
      explanation: `Callback em ${minutes} min → ${target.toFormat("HH:mm 'de' dd/MM")} (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 3. Hora explícita "às HH:mm" / "as HH" ──
  const hourExplicit = n.match(/(?:as|às|as)\s+(\d{1,2})(?::(\d{2}))?/);
  if (hourExplicit) {
    const h = parseInt(hourExplicit[1], 10);
    const m = parseInt(hourExplicit[2] ?? "0", 10);
    let target = setTime(now, h, m);
    if (target <= now) target = target.plus({ days: 1 });
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "high",
      explanation: `Callback às ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} → ${target.toFormat("dd/MM")} (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 4. "mais tarde" ──
  if (n.includes("mais tarde")) {
    const h = now.hour;
    if (h >= 9 && h < 16) {
      const target = now.plus({ hours: 2 });
      return {
        ok: true,
        callbackAtIso: target.toUTC().toISO()!,
        confidence: "low",
        explanation: `"Mais tarde" interpretado como +2h → ${target.toFormat("HH:mm 'de' dd/MM")} (${tz})`,
        needsClarification: false,
        clarificationQuestion: null,
      };
    } else {
      const target = nextBusinessDay9am(now, tz);
      return {
        ok: true,
        callbackAtIso: target.toUTC().toISO()!,
        confidence: "low",
        explanation: `"Mais tarde" fora do horário → próximo dia útil 09:00 (${tz})`,
        needsClarification: false,
        clarificationQuestion: null,
      };
    }
  }

  // ── 5. "amanhã de manhã" / "amanhã cedo" ──
  if (n.includes("amanha") && (n.includes("manha") || n.includes("cedo"))) {
    const target = setTime(now.plus({ days: 1 }), 9);
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "medium",
      explanation: `"Amanhã de manhã" → ${target.toFormat("dd/MM")} 09:00 (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 6. "amanhã de tarde" / "amanhã a tarde" ──
  if (n.includes("amanha") && n.includes("tarde")) {
    const target = setTime(now.plus({ days: 1 }), 15);
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "medium",
      explanation: `"Amanhã de tarde" → ${target.toFormat("dd/MM")} 15:00 (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 7. "amanhã" sem hora ──
  if (n.includes("amanha")) {
    const morning = setTime(now.plus({ days: 1 }), 9).toFormat("HH:mm 'de' dd/MM");
    const afternoon = setTime(now.plus({ days: 1 }), 15).toFormat("HH:mm 'de' dd/MM");
    return {
      ok: false,
      callbackAtIso: null,
      confidence: "low",
      explanation: 'Horário não especificado para "amanhã"',
      needsClarification: true,
      clarificationQuestion: "Qual horário amanhã você prefere? De manhã (09:00) ou à tarde (15:00)?",
      candidates: [morning, afternoon],
    };
  }

  // ── 8. "fim do dia" / "final do dia" ──
  if (n.includes("fim do dia") || n.includes("final do dia")) {
    const target = setTime(now, 18);
    const resolved = target <= now ? target.plus({ days: 1 }) : target;
    return {
      ok: true,
      callbackAtIso: resolved.toUTC().toISO()!,
      confidence: "medium",
      explanation: `"Fim do dia" → ${resolved.toFormat("dd/MM")} 18:00 (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 9. "de manhã" / "pela manhã" ──
  if (n.includes("manha")) {
    const target = setTime(now.hour < 9 ? now : now.plus({ days: 1 }), 9);
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "medium",
      explanation: `"De manhã" → ${target.toFormat("dd/MM")} 09:00 (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── 10. "de tarde" / "à tarde" ──
  if (n.includes("tarde")) {
    const target = setTime(now.hour < 15 ? now : now.plus({ days: 1 }), 15);
    return {
      ok: true,
      callbackAtIso: target.toUTC().toISO()!,
      confidence: "medium",
      explanation: `"De tarde" → ${target.toFormat("dd/MM")} 15:00 (${tz})`,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  // ── Fallback: não reconhecido ──
  return {
    ok: false,
    callbackAtIso: null,
    confidence: "low",
    explanation: "Não foi possível interpretar o horário.",
    needsClarification: true,
    clarificationQuestion:
      'Poderia me dizer um horário mais específico? Por exemplo: "daqui 2 horas", "amanhã de manhã" ou "às 15h".',
  };
}
