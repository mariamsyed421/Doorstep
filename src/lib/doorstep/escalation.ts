import type { Channel, Resident } from "@/lib/doorstep-data";
import type { ReplyCategory } from "./schemas";

/**
 * Deterministic escalation state machine.
 *
 *   0 Initial check-in → 1 Follow-up (preferred language) → 2 Automated voice call →
 *   3 Authorized emergency contact* → 4 Approved community check-in* →
 *   5 Flag for authorized responder welfare-check review*
 *
 * (*) third-party outreach: never automatic, always waits for coordinator approval.
 * Stages the resident has not consented to are skipped. A confirmed reply stops silence
 * escalation; assistance requests route to human review.
 */
export const STAGES = [
  { stage: 0, label: "Initial check-in", short: "Text", approval: false },
  { stage: 1, label: "Follow-up in preferred language", short: "Text", approval: false },
  { stage: 2, label: "Automated voice call", short: "Call", approval: false },
  { stage: 3, label: "Contact authorized emergency contact", short: "Family", approval: true },
  { stage: 4, label: "Approved community (neighbor) check-in", short: "Neighbor", approval: true },
  {
    stage: 5,
    label: "Flag for responder welfare-check review",
    short: "Responders",
    approval: true,
  },
] as const;
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export interface EscalationConfig {
  /** Minutes (simulation clock) to wait after each stage before moving on. */
  waitMinutes: Record<Stage, number>;
}
export const DEFAULT_CONFIG: EscalationConfig = {
  waitMinutes: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0 },
};

export type EscalationStatus =
  | "idle"
  | "active"
  | "awaiting_approval"
  | "paused"
  | "resolved"
  | "human_review"
  | "welfare_review"
  | "exhausted";

export interface Attempt {
  key: string;
  stage: Stage;
  channel: Channel | "contact" | "neighbor" | "responder";
  at: number;
  outcome: "delivered" | "failed" | "requested" | "approved";
}

export interface EscalationState {
  residentId: string;
  stage: Stage | null;
  status: EscalationStatus;
  nextActionAt: number | null;
  pendingStage: Stage | null;
  attempts: Attempt[];
  approvals: { stage: Stage; by: string; at: number }[];
  history: { at: number; text: string }[];
}

export type EscalationAction =
  | { type: "send"; residentId: string; stage: 0 | 1; channel: "sms"; key: string }
  | { type: "call"; residentId: string; stage: 2; channel: "voice"; key: string }
  | { type: "approval_requested"; residentId: string; stage: 3 | 4 | 5; key: string }
  | { type: "third_party"; residentId: string; stage: 3 | 4 | 5; key: string };

export const idle = (residentId: string): EscalationState => ({
  residentId,
  stage: null,
  status: "idle",
  nextActionAt: null,
  pendingStage: null,
  attempts: [],
  approvals: [],
  history: [],
});

export const actionKey = (residentId: string, stage: Stage) => `${residentId}:stage-${stage}`;

/** Whether consent and data allow a stage at all. */
export function allowed(r: Resident, stage: Stage): boolean {
  const c = r.profile.consent;
  switch (stage) {
    case 0:
    case 1:
      return c.automatedMessages && r.profile.contactChannels.includes("sms");
    case 2:
      return c.voiceCalls && r.profile.contactChannels.includes("voice");
    case 3:
      return c.contactEmergencyContact && r.emergencyContact.relation !== "none on file";
    case 4:
      return c.neighborCheck;
    case 5:
      return true; // Responder review is a coordinator decision, always available.
  }
}

function nextAllowed(r: Resident, from: Stage | null): Stage | null {
  for (let s = from === null ? 0 : from + 1; s <= 5; s++)
    if (allowed(r, s as Stage)) return s as Stage;
  return null;
}

function perform(
  state: EscalationState,
  r: Resident,
  stage: Stage,
  now: number,
  cfg: EscalationConfig,
): { state: EscalationState; actions: EscalationAction[] } {
  const key = actionKey(r.id, stage);
  // Idempotency: never repeat an attempt for the same stage.
  if (state.attempts.some((a) => a.key === key && a.outcome !== "requested"))
    return { state, actions: [] };
  const meta = STAGES[stage];
  let action: EscalationAction;
  let channel: Attempt["channel"];
  if (stage === 0 || stage === 1) {
    action = { type: "send", residentId: r.id, stage, channel: "sms", key };
    channel = "sms";
  } else if (stage === 2) {
    action = { type: "call", residentId: r.id, stage, channel: "voice", key };
    channel = "voice";
  } else {
    action = { type: "third_party", residentId: r.id, stage, key };
    channel = stage === 3 ? "contact" : stage === 4 ? "neighbor" : "responder";
  }
  const terminal = stage === 5;
  return {
    state: {
      ...state,
      stage,
      pendingStage: null,
      status: terminal ? "welfare_review" : "active",
      nextActionAt: terminal ? null : now + cfg.waitMinutes[stage],
      attempts: [
        ...state.attempts,
        { key, stage, channel, at: now, outcome: stage >= 3 ? "approved" : "delivered" },
      ],
      history: [...state.history, { at: now, text: meta.label }],
    },
    actions: [action],
  };
}

/** Begin escalation with the initial check-in (stage 0, or the first consented stage). */
export function start(r: Resident, now: number, cfg: EscalationConfig = DEFAULT_CONFIG) {
  const s = idle(r.id);
  const first = nextAllowed(r, null);
  if (first === null) return { state: { ...s, status: "exhausted" as const }, actions: [] };
  return advanceTo(s, r, first, now, cfg);
}

function advanceTo(
  state: EscalationState,
  r: Resident,
  stage: Stage,
  now: number,
  cfg: EscalationConfig,
) {
  if (STAGES[stage].approval) {
    const key = actionKey(r.id, stage);
    if (state.status === "awaiting_approval" && state.pendingStage === stage)
      return { state, actions: [] };
    return {
      state: {
        ...state,
        status: "awaiting_approval" as const,
        pendingStage: stage,
        nextActionAt: null,
        attempts: [
          ...state.attempts,
          { key, stage, channel: "contact" as const, at: now, outcome: "requested" as const },
        ],
        history: [
          ...state.history,
          { at: now, text: `Awaiting coordinator approval: ${STAGES[stage].label}` },
        ],
      },
      actions: [
        {
          type: "approval_requested",
          residentId: r.id,
          stage: stage as 3 | 4 | 5,
          key,
        } as EscalationAction,
      ],
    };
  }
  return perform(state, r, stage, now, cfg);
}

/** Advance the clock: performs at most one due stage per call. */
export function tick(
  state: EscalationState,
  r: Resident,
  now: number,
  cfg: EscalationConfig = DEFAULT_CONFIG,
) {
  if (state.status !== "active" || state.nextActionAt === null || now < state.nextActionAt)
    return { state, actions: [] as EscalationAction[] };
  const next = nextAllowed(r, state.stage);
  if (next === null)
    return {
      state: { ...state, status: "exhausted" as const, nextActionAt: null },
      actions: [] as EscalationAction[],
    };
  return advanceTo(state, r, next, now, cfg);
}

/** Coordinator approves the pending third-party stage. */
export function approve(
  state: EscalationState,
  r: Resident,
  stage: Stage,
  by: string,
  now: number,
  cfg: EscalationConfig = DEFAULT_CONFIG,
) {
  if (!STAGES[stage].approval || !allowed(r, stage))
    return { state, actions: [] as EscalationAction[] };
  if (["resolved", "welfare_review"].includes(state.status))
    return { state, actions: [] as EscalationAction[] };
  // Coordinators may approve the pending stage, or jump ahead from human review.
  const withApproval = { ...state, approvals: [...state.approvals, { stage, by, at: now }] };
  return perform(withApproval, r, stage, now, cfg);
}

/** A reply or confirmation arrived. */
export function onResponse(
  state: EscalationState,
  category: ReplyCategory | "confirmed_by_other",
  now: number,
): EscalationState {
  if (state.status === "resolved") return state;
  if (category === "unclear")
    return {
      ...state,
      history: [...state.history, { at: now, text: "Unclear reply — escalation continues" }],
    };
  if (category === "safe" || category === "evacuated" || category === "confirmed_by_other")
    return {
      ...state,
      status: "resolved",
      nextActionAt: null,
      pendingStage: null,
      history: [
        ...state.history,
        { at: now, text: "Confirmed response — silence escalation stopped" },
      ],
    };
  return {
    ...state,
    status: state.status === "welfare_review" ? "welfare_review" : "human_review",
    nextActionAt: null,
    pendingStage: null,
    history: [...state.history, { at: now, text: "Assistance request — routed to human review" }],
  };
}

export function setPaused(state: EscalationState, paused: boolean): EscalationState {
  if (paused && state.status === "active") return { ...state, status: "paused" };
  if (!paused && state.status === "paused") return { ...state, status: "active" };
  return state;
}

/** Record the provider's delivery result for an attempt. */
export function recordDelivery(
  state: EscalationState,
  key: string,
  outcome: "delivered" | "failed",
): EscalationState {
  return {
    ...state,
    attempts: state.attempts.map((a) =>
      a.key === key && a.outcome === "delivered" ? { ...a, outcome } : a,
    ),
  };
}
