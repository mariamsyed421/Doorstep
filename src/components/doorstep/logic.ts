import type { Resident } from "@/lib/doorstep-data";
import { RESIDENTS } from "@/lib/doorstep-data";
import { allowed, type EscalationState } from "@/lib/doorstep/escalation";
import { activeOutagesAt } from "@/lib/doorstep/outages";
import { levelRank, type Assessment } from "@/lib/doorstep/scoring";
import type { MarkerState, SimState } from "@/lib/doorstep/simulation";

export type QueueFilter = "all" | "review" | "help" | "awaiting" | "outage" | "resolved";
export const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "All open" },
  { key: "review", label: "Urgent / high" },
  { key: "help", label: "Requests" },
  { key: "awaiting", label: "Awaiting" },
  { key: "outage", label: "In outage" },
  { key: "resolved", label: "Safe" },
];

export function matchesFilter(
  r: Resident,
  f: QueueFilter,
  sim: SimState,
  a: Assessment | undefined,
  m: MarkerState | undefined,
) {
  switch (f) {
    case "all":
      return true;
    case "review":
      return a ? levelRank(a.level) >= levelRank("high") : false;
    case "help":
      return Boolean(a?.humanReview) || Boolean(sim.welfare[r.id]);
    case "awaiting":
      return m === "awaiting" || m === "away" || m === "unknown";
    case "outage":
      return activeOutagesAt(r, sim.outages).length > 0;
    case "resolved":
      return a?.level === "resolved";
  }
}

export function matchesSearch(r: Resident, q: string) {
  if (!q.trim()) return true;
  const t = q.toLowerCase();
  return [r.name, r.shortName, r.address, r.language].some((x) => x.toLowerCase().includes(t));
}

/** Most urgent first: explicit urgent requests, then level, then score. */
export function queueOrder(assessments: Record<string, Assessment>) {
  return [...RESIDENTS].sort((x, y) => {
    const a = assessments[x.id];
    const b = assessments[y.id];
    if (!a || !b) return 0;
    return (
      Number(b.override) - Number(a.override) ||
      levelRank(b.level) - levelRank(a.level) ||
      Number(b.humanReview) - Number(a.humanReview) ||
      b.score - a.score ||
      x.id.localeCompare(y.id)
    );
  });
}

export interface NextAction {
  stage: 3 | 4 | 5 | null;
  label: string;
  kind: "neighbor" | "contact" | "welfare" | "review" | "none";
  needsApproval: boolean;
}

/** The coordinator's suggested next step for a queue card. */
export function nextAction(
  r: Resident,
  esc: EscalationState | undefined,
  a: Assessment | undefined,
  welfare: boolean,
): NextAction {
  const none: NextAction = { stage: null, label: "", kind: "none", needsApproval: false };
  if (!esc || !a || a.level === "resolved") return none;
  if (welfare || esc.status === "welfare_review")
    return { ...none, label: "Flagged for responder review", kind: "review" };
  if (esc.status === "human_review") {
    if (a.override)
      return {
        stage: 5,
        label: "Flag for welfare-check review",
        kind: "welfare",
        needsApproval: true,
      };
    return { ...none, label: "Review request & match resources", kind: "review" };
  }
  const done = (s: number) => esc.attempts.some((t) => t.stage === s && t.outcome === "approved");
  if (r.planAnswer === "home" && allowed(r, 4) && !done(4))
    return { stage: 4, label: "Send neighbor to knock", kind: "neighbor", needsApproval: true };
  if (r.planAnswer !== "home" && r.planAnswer !== null && allowed(r, 3) && !done(3))
    return {
      stage: 3,
      label: `Call ${r.emergencyContact.relation} (${r.emergencyContact.name})`,
      kind: "contact",
      needsApproval: true,
    };
  if (r.planAnswer === null && allowed(r, 4) && !done(4) && !done(5))
    return {
      stage: 5,
      label: "Flag for welfare-check review",
      kind: "welfare",
      needsApproval: true,
    };
  if (allowed(r, 3) && !done(3))
    return {
      stage: 3,
      label: `Call ${r.emergencyContact.relation} (${r.emergencyContact.name})`,
      kind: "contact",
      needsApproval: true,
    };
  if (!done(5))
    return {
      stage: 5,
      label: "Flag for welfare-check review",
      kind: "welfare",
      needsApproval: true,
    };
  return none;
}

export const LEVEL_STYLE: Record<Assessment["level"], string> = {
  urgent: "bg-danger text-primary-foreground",
  high: "bg-danger/80 text-primary-foreground",
  medium: "bg-light text-night",
  low: "bg-muted text-foreground",
  resolved: "bg-safe text-night",
};
