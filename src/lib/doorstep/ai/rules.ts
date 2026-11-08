import type { Language, Resident } from "@/lib/doorstep-data";
import type { Classification, ClassificationResult, NeedTag } from "../schemas";

/**
 * Deterministic fallback for the AI service. Used when no model is configured, when both
 * providers fail, and in the browser so the demo never depends on the network.
 */
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ASCII words match on word boundaries ("ok" must not match "look"); other scripts by substring. */
const has = (t: string, words: string[]) =>
  words.some((w) =>
    /^[a-z0-9' ]+$/.test(w) ? new RegExp(`\\b${escape(w)}\\b`).test(t) : t.includes(w),
  );

const URGENT = [
  "911",
  "emergency",
  "urgent",
  "can't breathe",
  "cant breathe",
  "chest pain",
  "trapped",
  "bleeding",
  "unconscious",
  "fire",
  "water inside",
  "help now",
  "emergencia",
  "urgente",
  "no puedo respirar",
  "atrapado",
  "atrapada",
  "cấp cứu",
  "khẩn cấp",
  "طوارئ",
  "عاجل",
  "紧急",
  "救命",
];
const POWER = [
  "power",
  "electric",
  "electricity",
  "outage",
  "no light",
  "luz",
  "electricidad",
  "corriente",
  "mất điện",
  "điện",
  "كهرباء",
  "停电",
  "电",
];
const MED_DEVICE = [
  "oxygen",
  "oxígeno",
  "oxigeno",
  "cpap",
  "dialysis",
  "ventilator",
  "insulin",
  "insulina",
  "ôxy",
  "أكسجين",
  "اكسجين",
  "氧",
];
const HELP = [
  "help",
  "need",
  "needs",
  "ayuda",
  "necesito",
  "giúp",
  "cần",
  "مساعدة",
  "أحتاج",
  "帮",
  "需要",
];
const SAFE = [
  "safe",
  "ok",
  "okay",
  "fine",
  "all good",
  "bien",
  "estamos bien",
  "a salvo",
  "an toàn",
  "ổn",
  "بخير",
  "آمن",
  "安全",
  "没事",
  "我很好",
];
const EVAC = [
  "evacuated",
  "left town",
  "left before",
  "staying with",
  "at my sister",
  "evacuamos",
  "me fui",
  "đã sơ tán",
  "غادرت",
];
const TRANSPORT = [
  "ride",
  "car",
  "transport",
  "transportation",
  "carro",
  "transporte",
  "xe",
  "سيارة",
  "车",
];
const SHELTER = ["shelter", "refugio", "albergue", "nơi trú", "ملجأ", "避难"];
const ACCESS = ["wheelchair", "ramp", "accessible", "silla de ruedas", "walker", "andador"];
const INSURANCE = ["insurance", "claim", "seguro", "reclamo", "bảo hiểm", "تأمين", "保险"];
const DAMAGE = ["roof", "damage", "tree fell", "flood", "techo", "daño", "hư hại"];
const INFO = [
  "what does",
  "what should",
  "where do i",
  "where should",
  "how do i",
  "don't know",
  "dont know",
  "qué hago",
  "no sé",
  "?",
];

export function detectLanguage(text: string, fallback: Language = "English"): string {
  if (/[؀-ۿ]/.test(text)) return "Arabic";
  if (/[一-鿿]/.test(text)) return "Mandarin";
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text)) return "Vietnamese";
  if (
    /[ñ¿¡]|\b(estoy|estamos|necesito|ayuda|luz|por favor|gracias|casa|carro|seguro)\b/i.test(text)
  )
    return "Spanish";
  if (/^[\s\d.,!?-]*$/.test(text)) return fallback;
  return "English";
}

export function classifyWithRules(
  text: string,
  preferred: Language = "English",
): ClassificationResult {
  const t = text.toLowerCase().trim();
  const needs = new Set<NeedTag>();
  const power = has(t, POWER);
  const device = has(t, MED_DEVICE);
  if (power && device) needs.add("power_medical");
  else if (device) needs.add("medical");
  if (has(t, TRANSPORT)) needs.add("transportation");
  if (has(t, ACCESS)) needs.add("accessible_shelter");
  if (has(t, SHELTER)) needs.add("shelter");
  if (has(t, INSURANCE)) needs.add("insurance_guidance");
  if (has(t, DAMAGE)) needs.add("property_damage");

  const lang = detectLanguage(text, preferred);
  let c: Classification;
  const numericSafe = /^\s*1\b/.test(t);
  const numericHelp = /^\s*2\b/.test(t);
  const asking = has(t, INFO);
  if (has(t, URGENT) || needs.has("power_medical")) {
    c = {
      category: "urgent_assistance",
      urgency: "urgent",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: needs.has("power_medical")
        ? "Resident reports loss of electricity affecting medical equipment."
        : "Reply contains explicit emergency language.",
      recommendedAction:
        "Prompt coordinator review and suitable resource matching (power-capable shelter or medical support).",
      confidence: 0.7,
    };
  } else if (
    numericHelp ||
    has(t, HELP) ||
    (!asking &&
      (needs.has("transportation") || needs.has("accessible_shelter") || needs.has("shelter")))
  ) {
    c = {
      category: "needs_assistance",
      urgency: "elevated",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: `Resident asks for help${needs.size ? ` (${[...needs].join(", ").replaceAll("_", " ")})` : ""}.`,
      recommendedAction: needs.has("transportation")
        ? "Coordinator review: arrange transportation assistance and confirm a destination shelter."
        : needs.has("accessible_shelter")
          ? "Coordinator review: match an accessible shelter and confirm transport."
          : "Coordinator review: confirm the request and match suitable resources.",
      confidence: numericHelp ? 0.9 : 0.65,
    };
  } else if (has(t, EVAC)) {
    c = {
      category: "evacuated",
      urgency: "routine",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: "Resident reports being away from the affected area.",
      recommendedAction: "No safety action needed; update plan record.",
      confidence: 0.7,
    };
  } else if (numericSafe || has(t, SAFE)) {
    const guidance = needs.has("insurance_guidance") || needs.has("property_damage");
    c = {
      category: "safe",
      urgency: "routine",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: guidance
        ? "Resident is safe and asks about damage documentation."
        : "Resident confirms they are safe.",
      recommendedAction: guidance
        ? "Send safe-documentation and claim-preparation checklist after safety needs are met."
        : "No action needed.",
      confidence: numericSafe ? 0.95 : 0.75,
    };
  } else if (asking || needs.has("insurance_guidance")) {
    needs.add("information");
    c = {
      category: "info_request",
      urgency: "routine",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: "Resident is asking for information or guidance.",
      recommendedAction:
        "Reply with plain-language guidance and nearby resources in their language.",
      confidence: 0.6,
    };
  } else {
    c = {
      category: "unclear",
      urgency: "routine",
      needs: [...needs],
      detectedLanguage: lang,
      translation: text,
      explanation: "Reply could not be classified confidently.",
      recommendedAction: "Coordinator should read the reply; follow-up continues.",
      confidence: 0.3,
    };
  }
  return { ...c, provider: "rules", uncertain: c.confidence < 0.6 };
}

const CHECKIN: Record<Language, [string, string]> = {
  English: [
    "Doorstep check-in: Are you okay? Reply 1 Safe, 2 Need help.",
    "Checking again: reply 1 if you're safe, 2 if you need help.",
  ],
  Spanish: [
    "Doorstep: ¿Está bien? Responda 1 A salvo, 2 Necesito ayuda.",
    "Le escribimos de nuevo: responda 1 si está a salvo, 2 si necesita ayuda.",
  ],
  Vietnamese: [
    "Doorstep: Bạn có ổn không? Trả lời 1 An toàn, 2 Cần giúp.",
    "Hỏi lại: trả lời 1 nếu an toàn, 2 nếu cần giúp.",
  ],
  Arabic: [
    "Doorstep: هل أنت بخير؟ أرسل 1 آمن، 2 أحتاج مساعدة.",
    "نتواصل مجددًا: أرسل 1 إذا كنت آمنًا، 2 إذا احتجت مساعدة.",
  ],
  Mandarin: [
    "Doorstep：您安全吗？回复 1 安全，2 需要帮助。",
    "再次确认：安全请回复 1，需要帮助请回复 2。",
  ],
};

/** Deterministic, pre-translated check-in templates (stage 0 initial, stage 1 follow-up). */
export function checkInTemplate(r: Pick<Resident, "language">, stage: 0 | 1): string {
  return CHECKIN[r.language][stage];
}

export function summarizeWithRules(name: string, facts: string[]): string {
  return `${name}: ${facts.slice(0, 6).join(" · ")}`;
}
