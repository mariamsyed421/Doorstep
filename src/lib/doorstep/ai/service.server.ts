import type { z } from "zod";
import type { Language } from "@/lib/doorstep-data";
import { env } from "../env.server";
import {
  CheckInMessageSchema,
  ClassificationSchema,
  SummarySchema,
  type AiProvider,
  type ClassificationResult,
} from "../schemas";
import { checkInTemplate, classifyWithRules, summarizeWithRules } from "./rules";

/**
 * Centralized AI service. Order: preferred provider (AI_PROVIDER, default nemotron) →
 * Gemini fallback → deterministic rules. Every model response is validated with Zod; invalid
 * JSON counts as a provider failure. The AI only classifies and drafts text: it cannot
 * dispatch responders, contact anyone, or change scores (scoring is deterministic).
 */
const TIMEOUT_MS = 5000;

const SYSTEM = `You help disaster-response coordinators triage short replies from residents.
Return ONLY a JSON object. Never invent facts. Never recommend dispatching responders yourself;
recommend coordinator review instead. Never include personal data that was not in the input.`;

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = TIMEOUT_MS,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in model output");
  return JSON.parse(text.slice(start, end + 1));
}

async function openAiCompatible(
  url: string,
  key: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
) {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${model} HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  const content = message?.content ?? message?.reasoning_content;
  if (!content) throw new Error("Empty model response");
  return content;
}

type Caller = (prompt: string, signal: AbortSignal) => Promise<string>;

function nemotron(): Caller | null {
  const key = env("NVIDIA_API_KEY");
  if (!key) return null;
  const base = env("NVIDIA_API_BASE_URL") ?? "https://integrate.api.nvidia.com/v1";
  const model = env("NEMOTRON_MODEL") ?? "nvidia/llama-3.3-nemotron-super-49b-v1";
  return (p, s) => openAiCompatible(`${base}/chat/completions`, key, model, p, s);
}

function gemini(): Caller | null {
  // Prefer Lovable's AI gateway (keeps LOVABLE_API_KEY server-side); else a user-supplied key.
  const lovable = env("LOVABLE_API_KEY");
  if (lovable)
    return (p, s) =>
      openAiCompatible(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        lovable,
        env("GEMINI_MODEL") ?? "google/gemini-2.5-flash",
        p,
        s,
      );
  const key = env("GEMINI_API_KEY");
  if (!key) return null;
  const model = env("GEMINI_MODEL") ?? "gemini-2.5-flash";
  return async (prompt, signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");
    return text;
  };
}

function providerChain(): { name: Exclude<AiProvider, "rules">; call: Caller }[] {
  const n = nemotron();
  const g = gemini();
  const chain =
    env("AI_PROVIDER") === "gemini"
      ? [g && { name: "gemini" as const, call: g }, n && { name: "nemotron" as const, call: n }]
      : [n && { name: "nemotron" as const, call: n }, g && { name: "gemini" as const, call: g }];
  return chain.filter((x): x is NonNullable<typeof x> => Boolean(x));
}

async function run<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
): Promise<{ value: z.infer<S>; provider: Exclude<AiProvider, "rules"> } | null> {
  for (const p of providerChain()) {
    try {
      const raw = await withTimeout((signal) => p.call(prompt, signal));
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { value: parsed.data, provider: p.name };
      console.warn(`[ai] ${p.name} returned invalid JSON shape`);
    } catch (e) {
      console.warn(`[ai] ${p.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Safety-first merge: a model can add urgency, never remove an explicit urgent signal. */
function mergeWithRules(
  ai: ClassificationResult,
  rules: ClassificationResult,
): ClassificationResult {
  if (rules.category === "urgent_assistance" && ai.category !== "urgent_assistance")
    return {
      ...ai,
      category: "urgent_assistance",
      urgency: "urgent",
      needs: [...new Set([...ai.needs, ...rules.needs])],
      uncertain: true,
    };
  return ai;
}

export async function classifyReply(
  text: string,
  preferred: Language = "English",
): Promise<ClassificationResult> {
  const rules = classifyWithRules(text, preferred);
  const prompt = `Classify this resident reply to a post-disaster welfare check-in. Preferred language: ${preferred}.
Reply: """${text.slice(0, 1000)}"""
JSON keys: category (safe|needs_assistance|urgent_assistance|evacuated|info_request|unclear),
urgency (routine|elevated|urgent), needs (array of power_medical|medical|transportation|mobility|accessible_shelter|shelter|information|insurance_guidance|property_damage),
detectedLanguage, translation (concise English), explanation (one sentence), recommendedAction (one sentence, coordinator-facing), confidence (0-1).
Explicit requests for urgent help or loss of power to medical equipment are urgent_assistance.`;
  const out = await run(prompt, ClassificationSchema);
  if (!out) return { ...rules, uncertain: true };
  return mergeWithRules(
    { ...out.value, provider: out.provider, uncertain: out.value.confidence < 0.6 },
    rules,
  );
}

export async function draftCheckIn(language: Language, stage: 0 | 1, firstName: string) {
  const template = checkInTemplate({ language }, stage);
  const out = await run(
    `Write a short, calm SMS welfare check-in in ${language} for ${firstName} after a severe storm. It must ask them to reply 1 if safe or 2 if they need help. Max 300 characters. JSON: {"message": string}`,
    CheckInMessageSchema,
  );
  return out
    ? { message: out.value.message, provider: out.provider }
    : { message: template, provider: "rules" as const };
}

export async function summarizeCase(name: string, facts: string[]) {
  const out = await run(
    `Summarize this disaster-response case for a coordinator in 2-3 sentences. Use only these facts; do not speculate about injury. Name: ${name}. Facts:\n- ${facts.join("\n- ")}\nJSON: {"summary": string}`,
    SummarySchema,
  );
  return out
    ? { summary: out.value.summary, provider: out.provider }
    : { summary: summarizeWithRules(name, facts), provider: "rules" as const };
}
