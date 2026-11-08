import { RESIDENTS, type Language, type Resident } from "@/lib/doorstep-data";
import { checkInTemplate, classifyWithRules } from "./ai/rules";
import {
  DEFAULT_CONFIG,
  STAGES,
  approve as approveStage,
  idle,
  onResponse,
  recordDelivery,
  setPaused,
  start as startEscalation,
  tick as tickEscalation,
  type EscalationAction,
  type EscalationConfig,
  type EscalationState,
  type Stage,
} from "./escalation";
import { mockDeliveryOutcome } from "./messaging/mock";
import { SIMULATED_OUTAGE_FEED, activeOutagesAt, type OutageEvent } from "./outages";
import type { ClassificationResult } from "./schemas";
import { EMPTY_SIGNALS, assess, levelRank, type Assessment, type ResidentSignals } from "./scoring";

/**
 * The response simulation: a pure reducer over a simulated clock (minutes since the incident
 * began). It drives scripted demo events, the escalation state machine, mock message delivery
 * and Signal Fusion recalculation. The UI renders it; API routes add real providers on top.
 */
export interface Message {
  id: string;
  residentId: string;
  at: number;
  direction: "out" | "in";
  channel: "sms" | "voice" | "contact" | "neighbor";
  text: string;
  from: "doorstep" | "resident" | "neighbor" | "contact";
  status?: "delivered" | "failed" | "queued";
  provider?: "mock" | "photon";
  stage?: Stage;
  classification?: ClassificationResult;
}

export interface LogEntry {
  id: number;
  at: number;
  kind:
    "incident" | "outreach" | "reply" | "ai" | "outage" | "fusion" | "escalation" | "coordinator";
  text: string;
  residentId?: string;
}

export interface Incident {
  id: string;
  type: string;
  area: string;
  startedLabel: string;
  status: "pending" | "active";
}

export interface SimState {
  now: number;
  running: boolean;
  /** Real seconds per simulated hour. 30 = "30-second escalation intervals". */
  secondsPerSimHour: number;
  cursor: number;
  incident: Incident;
  outages: OutageEvent[];
  messages: Message[];
  signals: Record<string, ResidentSignals>;
  escalations: Record<string, EscalationState>;
  welfare: Record<string, boolean>;
  logs: LogEntry[];
  config: EscalationConfig;
  /** Message ids awaiting optional AI enrichment from the server. */
  enrich: string[];
  seq: number;
}

// ---------------- Scripted scenario ----------------
type ScriptEvent =
  | { at: number; kind: "incident" }
  | { at: number; kind: "initial_checkins" }
  | { at: number; kind: "outage" }
  | { at: number; kind: "reply"; residentId: string; text: string };

const SAFE_REPLY: Record<Language, string> = {
  English: "1",
  Spanish: "1 Estamos bien",
  Vietnamese: "1 an toàn",
  Arabic: "1 بخير",
  Mandarin: "1 安全",
};

export const DEMO_REPLIES = {
  omar: {
    residentId: "406",
    at: 75,
    text: "My power is out and my oxygen machine needs electricity.",
  },
  dolores: {
    residentId: "441",
    at: 95,
    text: "Se fue la luz y no tengo carro. Necesito transporte al refugio, por favor.",
  },
  wei: {
    residentId: "439",
    at: 105,
    text: "What does shelter in place mean? I don't know where to go if it gets worse.",
  },
  raymond: {
    residentId: "443",
    at: 115,
    text: "2 - a tree is blocking my ramp. I need an accessible shelter.",
  },
  karen: {
    residentId: "445",
    at: 125,
    text: "We're safe. A tree hit the roof — how do I document the damage for insurance?",
  },
} as const;
const SCRIPTED_IDS = new Set<string>(Object.values(DEMO_REPLIES).map((d) => d.residentId));

export const SCRIPT: ScriptEvent[] = (
  [
    { at: 0, kind: "incident" },
    { at: 5, kind: "initial_checkins" },
    ...RESIDENTS.filter((r) => r.checkInStatus === "safe" && !SCRIPTED_IDS.has(r.id)).map(
      (r, i) => ({
        at: 9 + ((i * 7) % 40),
        kind: "reply" as const,
        residentId: r.id,
        text: SAFE_REPLY[r.language],
      }),
    ),
    { at: 60, kind: "outage" },
    ...Object.values(DEMO_REPLIES).map((d) => ({
      at: d.at,
      kind: "reply" as const,
      residentId: d.residentId,
      text: d.text,
    })),
  ] satisfies ScriptEvent[] as ScriptEvent[]
).sort((a, b) => a.at - b.at);

/** The dashboard opens at T+3h05m: the storm hit three hours ago. */
export const SEED_MINUTE = 185;
export const START_MINUTE = -5;

/** Scripted answers when a coordinator-approved contact call goes out. */
export const CONTACT_RESPONSES: Record<string, string> = {
  "427": "He's here with me in Plano. His phone died, but he's safe.",
  "447": "Joe's been at my place in Waco since Friday. He's fine.",
};

// ---------------- Reducer ----------------
export type SimAction =
  | { type: "reset"; to?: number }
  | { type: "advance"; minutes: number }
  | { type: "advance_to_next" }
  | { type: "set_running"; running: boolean }
  | { type: "set_speed"; secondsPerSimHour: number }
  | { type: "set_wait"; minutes: number }
  | {
      type: "reply";
      residentId: string;
      text: string;
      classification?: ClassificationResult;
      channel?: "sms" | "voice";
    }
  | { type: "enriched"; messageId: string; classification: ClassificationResult }
  | { type: "enrich_done"; messageId: string }
  | { type: "approve"; residentId: string; stage: Stage; by: string }
  | {
      type: "confirm";
      residentId: string;
      by: "neighbor" | "contact";
      outcome: "safe" | "needsHelp" | "noAnswer";
      text: string;
    }
  | { type: "send_checkin"; residentId: string }
  | {
      type: "delivery";
      messageId: string;
      status: "delivered" | "failed" | "queued";
      provider: "mock" | "photon";
    };

const byId = new Map(RESIDENTS.map((r) => [r.id, r]));
export const residentById = (id: string) => byId.get(id);

export function initialState(): SimState {
  return {
    now: START_MINUTE,
    running: false,
    secondsPerSimHour: 30,
    cursor: 0,
    incident: {
      id: "INC-RICH-1107",
      type: "Severe thunderstorm",
      area: "Richardson, TX",
      startedLabel: "Saturday, November 7",
      status: "pending",
    },
    outages: [],
    messages: [],
    signals: Object.fromEntries(RESIDENTS.map((r) => [r.id, EMPTY_SIGNALS])),
    escalations: Object.fromEntries(RESIDENTS.map((r) => [r.id, idle(r.id)])),
    welfare: {},
    logs: [],
    config: DEFAULT_CONFIG,
    enrich: [],
    seq: 0,
  };
}

export function seededState(to = SEED_MINUTE): SimState {
  return simReducer(initialState(), { type: "advance", minutes: to - START_MINUTE });
}

function log(s: SimState, kind: LogEntry["kind"], text: string, residentId?: string): SimState {
  const entry: LogEntry = {
    id: s.seq + 1,
    at: s.now,
    kind,
    text,
    ...(residentId ? { residentId } : {}),
  };
  return { ...s, seq: s.seq + 1, logs: [...s.logs, entry] };
}

const commsOutageActive = (s: SimState, r: Resident) =>
  activeOutagesAt(r, s.outages, "communications").length > 0;

function applyActions(s: SimState, actions: EscalationAction[]): SimState {
  let next = s;
  for (const a of actions) {
    const r = byId.get(a.residentId);
    if (!r) continue;
    if (a.type === "send" || a.type === "call") {
      const status = mockDeliveryOutcome(r, commsOutageActive(next, r));
      const text =
        a.type === "send"
          ? checkInTemplate(r, a.stage)
          : `Automated voice call in ${r.language}: "Press 1 if you are safe, 2 if you need help."`;
      const msg: Message = {
        id: `m-${a.key}`,
        residentId: r.id,
        at: next.now,
        direction: "out",
        channel: a.channel,
        text,
        from: "doorstep",
        status,
        provider: "mock",
        stage: a.stage,
      };
      const sig = next.signals[r.id] ?? EMPTY_SIGNALS;
      next = {
        ...next,
        messages: [...next.messages, msg],
        signals: {
          ...next.signals,
          [r.id]: {
            ...sig,
            checkInSentAt: sig.checkInSentAt ?? next.now,
            failedDeliveries: sig.failedDeliveries + (status === "failed" ? 1 : 0),
          },
        },
        escalations: {
          ...next.escalations,
          [r.id]: recordDelivery(next.escalations[r.id] ?? idle(r.id), a.key, status),
        },
      };
      if (a.stage > 0)
        next = log(next, "outreach", `${STAGES[a.stage].label} → ${r.shortName} (${status})`, r.id);
    } else if (a.type === "approval_requested") {
      next = log(
        next,
        "escalation",
        `Coordinator approval needed: ${STAGES[a.stage].label} for ${r.shortName}`,
        r.id,
      );
    } else {
      next = log(next, "escalation", `Approved: ${STAGES[a.stage].label} for ${r.shortName}`, r.id);
      if (a.stage === 5) next = { ...next, welfare: { ...next.welfare, [r.id]: true } };
      if (a.stage === 3 || a.stage === 4)
        next = {
          ...next,
          messages: [
            ...next.messages,
            {
              id: `m-${a.key}`,
              residentId: r.id,
              at: next.now,
              direction: "out",
              channel: a.stage === 3 ? "contact" : "neighbor",
              from: "doorstep",
              text:
                a.stage === 3
                  ? `Calling ${r.emergencyContact.relation} ${r.emergencyContact.name} (authorized contact)`
                  : `Asked opted-in neighbor ${r.neighbor.name} to knock on ${r.address}`,
              status: "delivered",
              provider: "mock",
              stage: a.stage,
            },
          ],
        };
    }
  }
  return next;
}

export function assessAll(s: SimState): Record<string, Assessment> {
  return Object.fromEntries(
    RESIDENTS.map((r) => [
      r.id,
      assess(r, s.signals[r.id] ?? EMPTY_SIGNALS, s.outages, Math.max(0, s.now)),
    ]),
  );
}

function receiveReply(
  s: SimState,
  r: Resident,
  text: string,
  c: ClassificationResult,
  channel: "sms" | "voice" = "sms",
): SimState {
  const id = `m-in-${r.id}-${s.seq + 1}`;
  const sig = s.signals[r.id] ?? EMPTY_SIGNALS;
  let next: SimState = {
    ...s,
    messages: [
      ...s.messages,
      {
        id,
        residentId: r.id,
        at: s.now,
        direction: "in",
        channel,
        text,
        from: "resident",
        classification: c,
      },
    ],
    signals: { ...s.signals, [r.id]: { ...sig, repliedAt: s.now, latestReply: c } },
    escalations: {
      ...s.escalations,
      [r.id]: onResponse(s.escalations[r.id] ?? idle(r.id), c.category, s.now),
    },
    enrich: c.provider === "rules" && !/^\s*1\b/.test(text) ? [...s.enrich, id] : s.enrich,
  };
  if (c.category !== "safe" || c.needs.length) {
    next = log(next, "reply", `${r.shortName} replied (${c.detectedLanguage}): “${text}”`, r.id);
    next = log(
      next,
      "ai",
      `Classified ${c.category.replaceAll("_", " ")} · ${c.urgency}${c.needs.length ? ` · ${c.needs.join(", ").replaceAll("_", " ")}` : ""} (${c.provider}${c.uncertain ? ", uncertain" : ""})`,
      r.id,
    );
    if (c.category === "urgent_assistance")
      next = log(next, "escalation", `URGENT human review: ${r.shortName}`, r.id);
    else if (c.category === "needs_assistance" || c.category === "info_request")
      next = log(next, "escalation", `Routed to coordinator review: ${r.shortName}`, r.id);
  }
  return next;
}

function runScriptEvent(s: SimState, e: ScriptEvent): SimState {
  switch (e.kind) {
    case "incident":
      return log(
        { ...s, incident: { ...s.incident, status: "active" } },
        "incident",
        `Incident ${s.incident.id} opened: ${s.incident.type}, ${s.incident.area}`,
      );
    case "initial_checkins": {
      let next = s;
      let sent = 0;
      for (const r of RESIDENTS) {
        const esc = next.escalations[r.id];
        if (esc && esc.status !== "idle") continue;
        const { state, actions } = startEscalation(r, next.now, next.config);
        next = { ...next, escalations: { ...next.escalations, [r.id]: state } };
        next = applyActions(next, actions);
        sent += actions.length;
      }
      return log(
        next,
        "outreach",
        `Initial check-ins sent to ${sent} opted-in households in their preferred languages`,
      );
    }
    case "outage": {
      const before = assessAll(s);
      let next: SimState = {
        ...s,
        outages: SIMULATED_OUTAGE_FEED.map((o) => ({ ...o, startedAt: s.now, active: true })),
      };
      for (const o of next.outages)
        next = log(
          next,
          "outage",
          `${o.source}: ${o.label} · ~${o.estimatedHouseholds} households · confidence ${Math.round(o.confidence * 100)}% (SIMULATED)`,
        );
      const after = assessAll(next);
      const changed = RESIDENTS.filter((r) => before[r.id]?.score !== after[r.id]?.score).length;
      const unresolved = RESIDENTS.filter(
        (r) => after[r.id]?.level !== "resolved" && activeOutagesAt(r, next.outages).length > 0,
      );
      const power = unresolved.filter((r) => r.profile.needs.powerDependentEquipment).length;
      next = log(next, "fusion", `Signal Fusion recalculated: ${changed} residents re-scored.`);
      return log(
        next,
        "fusion",
        `${unresolved.length} unresolved residents overlap a simulated outage zone. ${power} declared power-dependent needs. Recommend reviewing alternate outreach options.`,
      );
    }
    case "reply": {
      const r = byId.get(e.residentId);
      if (!r) return s;
      const sig = s.signals[r.id];
      // Never script a reply for someone the coordinator already resolved.
      if (sig?.confirmedBy) return s;
      return receiveReply(s, r, e.text, classifyWithRules(e.text, r.language));
    }
  }
}

function stepMinute(s: SimState): SimState {
  let next: SimState = { ...s, now: s.now + 1 };
  while (next.cursor < SCRIPT.length && (SCRIPT[next.cursor]?.at ?? Infinity) <= next.now) {
    const e = SCRIPT[next.cursor];
    next = { ...next, cursor: next.cursor + 1 };
    if (e) next = runScriptEvent(next, e);
  }
  for (const r of RESIDENTS) {
    const esc = next.escalations[r.id];
    if (!esc || esc.status !== "active") continue;
    const { state, actions } = tickEscalation(esc, r, next.now, next.config);
    if (state === esc) continue;
    next = { ...next, escalations: { ...next.escalations, [r.id]: state } };
    next = applyActions(next, actions);
  }
  return next;
}

function nextEventMinute(s: SimState): number | null {
  const script = SCRIPT[s.cursor]?.at ?? null;
  const due = Object.values(s.escalations)
    .filter((e) => e.status === "active" && e.nextActionAt !== null)
    .map((e) => e.nextActionAt as number);
  const all = [...(script !== null ? [script] : []), ...due].filter((m) => m > s.now);
  return all.length ? Math.min(...all) : null;
}

export function simReducer(s: SimState, a: SimAction): SimState {
  switch (a.type) {
    case "reset":
      return a.to === undefined ? initialState() : seededState(a.to);
    case "advance": {
      let next = s;
      for (let i = 0; i < Math.max(0, Math.floor(a.minutes)); i++) next = stepMinute(next);
      return next;
    }
    case "advance_to_next": {
      const m = nextEventMinute(s);
      return m === null
        ? simReducer(s, { type: "advance", minutes: 60 })
        : simReducer(s, { type: "advance", minutes: m - s.now });
    }
    case "set_running": {
      const escalations = Object.fromEntries(
        Object.entries(s.escalations).map(([k, e]) => [k, setPaused(e, false)]),
      );
      return { ...s, running: a.running, escalations };
    }
    case "set_speed":
      return { ...s, secondsPerSimHour: Math.max(1, a.secondsPerSimHour) };
    case "set_wait": {
      const m = Math.max(5, Math.min(240, Math.round(a.minutes)));
      return { ...s, config: { waitMinutes: { 0: m, 1: m, 2: m, 3: m, 4: m, 5: 0 } } };
    }
    case "reply": {
      const r = byId.get(a.residentId);
      if (!r) return s;
      return receiveReply(
        s,
        r,
        a.text,
        a.classification ?? classifyWithRules(a.text, r.language),
        a.channel,
      );
    }
    case "enriched": {
      const msg = s.messages.find((m) => m.id === a.messageId);
      if (!msg) return s;
      const sig = s.signals[msg.residentId] ?? EMPTY_SIGNALS;
      const isLatest =
        s.messages.filter((m) => m.residentId === msg.residentId && m.direction === "in").at(-1)
          ?.id === msg.id;
      let next: SimState = {
        ...s,
        enrich: s.enrich.filter((id) => id !== a.messageId),
        messages: s.messages.map((m) =>
          m.id === a.messageId ? { ...m, classification: a.classification } : m,
        ),
        signals: isLatest
          ? { ...s.signals, [msg.residentId]: { ...sig, latestReply: a.classification } }
          : s.signals,
      };
      if (isLatest)
        next = {
          ...next,
          escalations: {
            ...next.escalations,
            [msg.residentId]: onResponse(
              next.escalations[msg.residentId] ?? idle(msg.residentId),
              a.classification.category,
              s.now,
            ),
          },
        };
      return log(
        next,
        "ai",
        `${a.classification.provider} re-classified reply: ${a.classification.category.replaceAll("_", " ")} — ${a.classification.explanation}`,
        msg.residentId,
      );
    }
    case "enrich_done":
      return { ...s, enrich: s.enrich.filter((id) => id !== a.messageId) };
    case "approve": {
      const r = byId.get(a.residentId);
      const esc = s.escalations[a.residentId];
      if (!r || !esc) return s;
      const { state, actions } = approveStage(esc, r, a.stage, a.by, s.now, s.config);
      if (state === esc) return s;
      return applyActions({ ...s, escalations: { ...s.escalations, [r.id]: state } }, actions);
    }
    case "confirm": {
      const r = byId.get(a.residentId);
      if (!r) return s;
      const who = a.by === "neighbor" ? r.neighbor.name.split(" ")[0] : r.emergencyContact.name;
      let next: SimState = {
        ...s,
        messages: [
          ...s.messages,
          {
            id: `m-conf-${r.id}-${s.seq + 1}`,
            residentId: r.id,
            at: s.now,
            direction: "in",
            channel: a.by,
            from: a.by,
            text: a.text,
          },
        ],
      };
      next = log(next, "coordinator", `${who}: ${a.text}`, r.id);
      const sig = next.signals[r.id] ?? EMPTY_SIGNALS;
      if (a.outcome === "safe") {
        next = {
          ...next,
          welfare: { ...next.welfare, [r.id]: false },
          signals: { ...next.signals, [r.id]: { ...sig, confirmedBy: a.by } },
          escalations: {
            ...next.escalations,
            [r.id]: onResponse(next.escalations[r.id] ?? idle(r.id), "confirmed_by_other", s.now),
          },
        };
      } else if (a.outcome === "needsHelp") {
        const c: ClassificationResult = {
          ...classifyWithRules("needs help", r.language),
          explanation: `${a.by === "neighbor" ? "Neighbor" : "Emergency contact"} reports the resident needs help.`,
          translation: a.text,
        };
        next = {
          ...next,
          signals: { ...next.signals, [r.id]: { ...sig, latestReply: c } },
          escalations: {
            ...next.escalations,
            [r.id]: onResponse(next.escalations[r.id] ?? idle(r.id), "needs_assistance", s.now),
          },
        };
      }
      return next;
    }
    case "send_checkin": {
      const r = byId.get(a.residentId);
      const esc = s.escalations[a.residentId];
      if (!r || !esc || esc.status !== "idle") return s;
      const { state, actions } = startEscalation(r, s.now, s.config);
      return applyActions({ ...s, escalations: { ...s.escalations, [r.id]: state } }, actions);
    }
    case "delivery":
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === a.messageId ? { ...m, status: a.status, provider: a.provider } : m,
        ),
      };
  }
}

// ---------------- Derived view helpers ----------------
export type MarkerState = "safe" | "danger" | "help" | "awaiting" | "away" | "unknown";

export function markerFor(r: Resident, s: SimState, a: Assessment | undefined): MarkerState {
  if (s.welfare[r.id]) return "help";
  if (!a) return "unknown";
  const reply = s.signals[r.id]?.latestReply;
  if (a.level === "resolved") return "safe";
  if (a.override) return "danger";
  if (reply && (reply.category === "needs_assistance" || reply.category === "info_request"))
    return "help";
  if ((s.signals[r.id]?.checkInSentAt ?? null) === null) return "unknown";
  if (levelRank(a.level) >= levelRank("high")) return "danger";
  if (r.planAnswer === "family" || r.planAnswer === "shelter") return "away";
  if (r.planAnswer === null) return "unknown";
  return "awaiting";
}

export function formatClock(min: number) {
  if (min < 0) return `T−${Math.abs(min)}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `T+${h}h ${String(m).padStart(2, "0")}m`;
}

/** Wall-clock label for a simulation minute (incident began 2:00pm Saturday). */
export function wallClock(min: number) {
  const total = 14 * 60 + min;
  const h24 = Math.floor(total / 60) % 24;
  const mm = String(((total % 60) + 60) % 60).padStart(2, "0");
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mm}${h24 >= 12 ? "pm" : "am"}`;
}
