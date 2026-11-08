import { RESIDENTS } from "@/lib/doorstep-data";
import { classifyWithRules, summarizeWithRules } from "./ai/rules";
import { SYNTHETIC_SHELTERS, type Shelter } from "./resources";
import { ClassificationResultSchema, type ClassificationResult } from "./schemas";

/**
 * Browser client for the /api routes. Every call has a deterministic local fallback so the
 * demo keeps working on static hosting or offline.
 */
async function post<T>(path: string, body: unknown, ms = 9000): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

export async function classify(text: string, residentId: string): Promise<ClassificationResult> {
  const r = RESIDENTS.find((x) => x.id === residentId);
  try {
    const out = await post<{ classification: unknown }>("/api/classify", { text, residentId });
    return ClassificationResultSchema.parse(out.classification);
  } catch {
    return { ...classifyWithRules(text, r?.language ?? "English"), uncertain: true };
  }
}

export async function summarize(residentId: string, name: string, facts: string[]) {
  try {
    return await post<{ summary: string; provider: string }>("/api/summarize", {
      residentId,
      facts,
    });
  } catch {
    return { summary: summarizeWithRules(name, facts), provider: "rules" };
  }
}

export async function recordEscalation(residentId: string, stage: number, approvedBy?: string) {
  try {
    return await post<{ duplicate: boolean }>("/api/escalate", {
      residentId,
      stage,
      idempotencyKey: `${residentId}:stage-${stage}`,
      ...(approvedBy
        ? { coordinatorApproval: { approvedBy, approvedAt: new Date().toISOString() } }
        : {}),
    });
  } catch {
    return null;
  }
}

export async function sendCheckin(residentId: string) {
  return post<{
    text: string;
    delivery: {
      provider: "mock" | "photon";
      simulated: boolean;
      messageId: string;
      status: "queued" | "delivered" | "failed";
      error?: string;
    };
  }>("/api/checkin", { residentId, channel: "sms", stage: 0 });
}

export async function loadShelters(): Promise<{
  shelters: Shelter[];
  source: string;
  warning?: string;
}> {
  try {
    const res = await fetch("/api/shelters", { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error();
    return (await res.json()) as { shelters: Shelter[]; source: string; warning?: string };
  } catch {
    return {
      shelters: SYNTHETIC_SHELTERS,
      source: "synthetic",
      warning: "Shelter service unreachable; showing synthetic demo shelters",
    };
  }
}

export interface Integrations {
  aiProvider: string;
  nemotron: boolean;
  gemini: boolean;
  photon: boolean;
  photonResidentId?: string;
  supabase: boolean;
  fema: boolean;
}
export async function health(): Promise<Integrations | null> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as { integrations: Integrations }).integrations : null;
  } catch {
    return null;
  }
}

export async function inbox(since: string) {
  try {
    const res = await fetch(`/api/inbox?since=${encodeURIComponent(since)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      replies: {
        id: string;
        resident_id: string;
        reply: string;
        classification: unknown;
        created_at: string;
      }[];
    };
    return data.replies;
  } catch {
    return [];
  }
}
