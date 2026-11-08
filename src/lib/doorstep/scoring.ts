import type { Resident } from "@/lib/doorstep-data";
import { activeOutagesAt, type OutageEvent } from "./outages";
import type { ClassificationResult } from "./schemas";

/**
 * SIGNAL FUSION scoring engine.
 *
 * Deterministic and explainable: no LLM is involved. It fuses the preparedness profile,
 * check-in delivery evidence, outage intelligence, and the (already classified) latest reply
 * into a review priority. Weights are hackathon demonstration heuristics, NOT validated
 * emergency triage criteria.
 *
 * Deliberately NOT used as evidence of danger: age, language, disability identity, insurance
 * status, renter status. Language only guides how we reach someone.
 */
export const DEFAULT_WEIGHTS = {
  powerDependentInOutage: 5,
  criticalMedical: 3,
  mobility: 3,
  livesAlone: 2,
  transportation: 2,
  plannedToRemain: 3,
  noConfirmedResponse: 2,
  perAdditionalSilentHour: 1,
  silentHoursCap: 6,
  multipleFailedDeliveries: 2,
  outageOverlap: 3,
} as const;
export type Weights = { -readonly [K in keyof typeof DEFAULT_WEIGHTS]: number };

export const THRESHOLDS = { urgent: 20, high: 12, medium: 6 } as const;

export type PriorityLevel = "urgent" | "high" | "medium" | "low" | "resolved";
export type EvidenceSource =
  | "Preparedness profile (synthetic, STEAR-style)"
  | "Check-in delivery log"
  | "Simulated Ting outage feed"
  | "Simulated carrier status feed"
  | "Resident reply (AI-classified)"
  | "Coordinator / neighbor confirmation";

export interface Factor {
  id: keyof Weights | "explicitUrgentRequest" | "assistanceRequest";
  label: string;
  points: number;
  source: EvidenceSource;
}

export interface ResidentSignals {
  /** Simulation minute the first check-in was sent, or null if none yet. */
  checkInSentAt: number | null;
  /** Minute of the latest reply from the resident (any category). */
  repliedAt: number | null;
  latestReply: ClassificationResult | null;
  failedDeliveries: number;
  /** Safety confirmed by someone other than the resident (neighbor knock, contact call). */
  confirmedBy: "neighbor" | "contact" | null;
}

export const EMPTY_SIGNALS: ResidentSignals = {
  checkInSentAt: null,
  repliedAt: null,
  latestReply: null,
  failedDeliveries: 0,
  confirmedBy: null,
};

export interface Assessment {
  residentId: string;
  score: number;
  level: PriorityLevel;
  /** True when an explicit urgent request forced urgent review regardless of score. */
  override: boolean;
  humanReview: boolean;
  factors: Factor[];
  explanation: string;
  recommendedAction: string;
  evidence: EvidenceSource[];
  confidence: "low" | "medium" | "high";
  silentHours: number;
  /** Simulation minute this assessment was computed for. */
  computedAt: number;
}

export function levelForScore(score: number): Exclude<PriorityLevel, "resolved"> {
  if (score >= THRESHOLDS.urgent) return "urgent";
  if (score >= THRESHOLDS.high) return "high";
  if (score >= THRESHOLDS.medium) return "medium";
  return "low";
}

const RANK: Record<PriorityLevel, number> = { urgent: 4, high: 3, medium: 2, low: 1, resolved: 0 };
export const levelRank = (l: PriorityLevel) => RANK[l];

export function assess(
  resident: Resident,
  signals: ResidentSignals,
  outages: OutageEvent[],
  now: number,
  weights: Weights = { ...DEFAULT_WEIGHTS },
): Assessment {
  const f: Factor[] = [];
  const p = resident.profile;
  const PROFILE = "Preparedness profile (synthetic, STEAR-style)" as const;
  const powerOutages = activeOutagesAt(resident, outages, "power");
  const commsOutages = activeOutagesAt(resident, outages, "communications");
  const reply = signals.latestReply;
  const confirmedSafe =
    signals.confirmedBy !== null ||
    (reply !== null && (reply.category === "safe" || reply.category === "evacuated"));
  const responded = signals.repliedAt !== null || signals.confirmedBy !== null;

  if (p.needs.powerDependentEquipment && powerOutages.length)
    f.push({
      id: "powerDependentInOutage",
      label: `${p.needs.powerDependentEquipment} + active local power outage`,
      points: weights.powerDependentInOutage,
      source: "Simulated Ting outage feed",
    });
  if (p.needs.criticalMedical)
    f.push({
      id: "criticalMedical",
      label: "Declared critical medical need",
      points: weights.criticalMedical,
      source: PROFILE,
    });
  if (p.needs.mobility)
    f.push({
      id: "mobility",
      label: "Mobility / accessibility assistance need",
      points: weights.mobility,
      source: PROFILE,
    });
  if (resident.livesAlone)
    f.push({ id: "livesAlone", label: "Lives alone", points: weights.livesAlone, source: PROFILE });
  if (p.needs.transportation)
    f.push({
      id: "transportation",
      label: "Needs transportation assistance",
      points: weights.transportation,
      source: PROFILE,
    });
  if (resident.planAnswer === "home")
    f.push({
      id: "plannedToRemain",
      label: "Planned to remain in the affected area",
      points: weights.plannedToRemain,
      source: PROFILE,
    });

  let silentHours = 0;
  if (signals.checkInSentAt !== null && !responded) {
    silentHours = Math.max(0, (now - signals.checkInSentAt) / 60);
    f.push({
      id: "noConfirmedResponse",
      label: "No confirmed response",
      points: weights.noConfirmedResponse,
      source: "Check-in delivery log",
    });
    const extra = Math.min(weights.silentHoursCap, Math.max(0, Math.floor(silentHours) - 1));
    if (extra > 0)
      f.push({
        id: "perAdditionalSilentHour",
        label: `${Math.floor(silentHours)} hours without response`,
        points: extra * weights.perAdditionalSilentHour,
        source: "Check-in delivery log",
      });
  }
  if (signals.failedDeliveries >= 2 && !responded)
    f.push({
      id: "multipleFailedDeliveries",
      label: `${signals.failedDeliveries} failed message deliveries`,
      points: weights.multipleFailedDeliveries,
      source: "Check-in delivery log",
    });
  if (powerOutages.length || commsOutages.length)
    f.push({
      id: "outageOverlap",
      label: `Residence inside ${[...powerOutages, ...commsOutages].map((o) => o.label).join(", ")}`,
      points: weights.outageOverlap,
      source: powerOutages.length ? "Simulated Ting outage feed" : "Simulated carrier status feed",
    });

  const score = f.reduce((n, x) => n + x.points, 0);
  let level: PriorityLevel = levelForScore(score);
  let override = false;
  let humanReview = false;
  if (reply?.category === "urgent_assistance" || reply?.urgency === "urgent") {
    f.unshift({
      id: "explicitUrgentRequest",
      label: "Explicit urgent assistance request",
      points: 0,
      source: "Resident reply (AI-classified)",
    });
    level = "urgent";
    override = true;
    humanReview = true;
  } else if (reply?.category === "needs_assistance" || reply?.category === "info_request") {
    f.unshift({
      id: "assistanceRequest",
      label:
        reply.category === "info_request"
          ? "Asked for information / guidance"
          : "Requested assistance",
      points: 0,
      source: "Resident reply (AI-classified)",
    });
    humanReview = true;
    if (reply.category === "needs_assistance" && levelRank(level) < RANK.high) level = "high";
  } else if (confirmedSafe) {
    level = "resolved";
  }

  const evidence = [...new Set(f.map((x) => x.source))];
  if (signals.confirmedBy) evidence.push("Coordinator / neighbor confirmation");
  if (reply && !evidence.includes("Resident reply (AI-classified)"))
    evidence.push("Resident reply (AI-classified)");

  const independent = evidence.filter((e) => e !== PROFILE).length;
  const confidence: Assessment["confidence"] =
    reply && !reply.uncertain
      ? "high"
      : signals.confirmedBy
        ? "high"
        : reply?.uncertain
          ? "medium"
          : independent >= 2
            ? "medium"
            : "low";

  return {
    residentId: resident.id,
    score,
    level,
    override,
    humanReview,
    factors: f,
    explanation: explain(resident, level, f, confirmedSafe, signals),
    recommendedAction: recommend(resident, level, reply, f, signals),
    evidence,
    confidence,
    silentHours,
    computedAt: now,
  };
}

function explain(
  r: Resident,
  level: PriorityLevel,
  f: Factor[],
  safe: boolean,
  s: ResidentSignals,
) {
  if (level === "resolved")
    return s.confirmedBy
      ? `Safety confirmed by ${s.confirmedBy === "neighbor" ? "an opted-in neighbor" : "their emergency contact"}. Declared needs remain on file for recovery support.`
      : `${r.shortName} confirmed ${s.latestReply?.category === "evacuated" ? "they evacuated" : "they are safe"}. Silence escalation stopped.`;
  if (!f.length)
    return "No elevated signals. Silence alone is not treated as evidence of harm or of safety.";
  const top = f.filter(
    (x) => x.points > 0 || x.id === "explicitUrgentRequest" || x.id === "assistanceRequest",
  );
  const lead = top
    .slice(0, 4)
    .map((x) =>
      /^[A-Z][a-z]/.test(x.label) ? x.label.charAt(0).toLowerCase() + x.label.slice(1) : x.label,
    )
    .join("; ");
  const silent = f.some((x) => x.id === "noConfirmedResponse");
  const tail =
    safe || !silent || level === "low"
      ? ""
      : " Silence alone is never treated as proof of harm — these signals together warrant review.";
  return `Signals combined: ${lead}.${tail}`;
}

function recommend(
  r: Resident,
  level: PriorityLevel,
  reply: ClassificationResult | null,
  f: Factor[],
  s: ResidentSignals,
) {
  if (reply && (reply.category === "urgent_assistance" || reply.urgency === "urgent"))
    return "Urgent coordinator review now: confirm details with the resident and match power-capable or medical resources. Coordinator decides on any responder involvement.";
  if (reply?.category === "needs_assistance")
    return (
      reply.recommendedAction ||
      "Coordinator review: confirm the request and match suitable resources."
    );
  if (reply?.category === "info_request")
    return "Send plain-language guidance in their preferred language and confirm they have what they need.";
  if (level === "resolved")
    return r.profile.insurance
      ? "No safety action needed. Offer damage-documentation and recovery resources when appropriate."
      : "No safety action needed. Keep monitoring; offer recovery resources.";
  const failed = f.some((x) => x.id === "multipleFailedDeliveries");
  if (level === "urgent" || level === "high")
    return failed
      ? "Review for alternate outreach (voice call or authorized contact) — texts are failing — and possible welfare-check coordination."
      : "Review for alternate outreach and possible welfare-check coordination.";
  if (level === "medium")
    return `Continue scheduled follow-up in ${r.language}; consider a voice call.`;
  return s.checkInSentAt === null
    ? "Initial check-in not yet sent."
    : "Await reply; follow-up is scheduled.";
}
