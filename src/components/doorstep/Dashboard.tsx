import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CloudLightning,
  Crosshair,
  Flame,
  Footprints,
  House,
  Layers,
  MapPin,
  MessageSquare,
  Play,
  Radio,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  RESIDENTS,
  DISTRICTS,
  CITY_TOTAL,
  OTHER_DISTRICTS_UNCONFIRMED,
  districtCount,
  accountedFor,
  urgency,
  type Resident,
} from "@/lib/doorstep-data";
import {
  classify,
  health,
  inbox,
  loadShelters,
  recordEscalation,
  sendCheckin,
  type Integrations,
} from "@/lib/doorstep/api";
import { activeOutagesAt } from "@/lib/doorstep/outages";
import type { Shelter } from "@/lib/doorstep/resources";
import { ClassificationResultSchema } from "@/lib/doorstep/schemas";
import { levelRank } from "@/lib/doorstep/scoring";
import {
  CONTACT_RESPONSES,
  assessAll,
  markerFor,
  seededState,
  simReducer,
  wallClock,
  formatClock,
  type MarkerState,
  type Message,
} from "@/lib/doorstep/simulation";
import { cn } from "@/lib/utils";
import { StreetView } from "./StreetView";
import { PriorityQueue } from "./PriorityQueue";
import { ResidentDetail } from "./ResidentDetail";
import { SimControls } from "./SimControls";
import { matchesFilter, matchesSearch, queueOrder, type QueueFilter } from "./logic";
const ResponseMap = lazy(() => import("./ResponseMap"));
const COORDINATOR = "Coordinator MS";

const DEMO_CAPTIONS: [number, string][] = [
  [5, "Event 1 · Severe thunderstorm incident opened"],
  [20, "Event 2 · Initial check-ins sent in preferred languages"],
  [60, "Event 3 · Residents confirming safety"],
  [66, "Event 4 · Simulated Ting outage detected"],
  [75, "Event 5–6 · Signal Fusion re-scored · queue re-ranked"],
  [95, "Mr. Haddad: power out + oxygen → urgent human review"],
  [128, "Event 7–8 · Spanish request classified · resources suggested"],
  [186, "Escalations advancing · coordinator approvals requested"],
];

export function Dashboard() {
  const [sim, dispatch] = useReducer(simReducer, undefined, () => seededState());
  const [district, setDistrict] = useState<string | null>(null);
  const [streetView, setStreetView] = useState(true);
  const [heatmap, setHeatmap] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<"neighbor" | "contact">("neighbor");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [noAnswer, setNoAnswer] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [walking, setWalking] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [shelters, setShelters] = useState<{
    shelters: Shelter[];
    source: string;
    warning?: string;
  } | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [realMessages, setRealMessages] = useState<Message[]>([]);
  const [demo, setDemo] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoCaption, setDemoCaption] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const acc = useRef(0);
  const enriching = useRef(new Set<string>());
  const reduce = useReducedMotion();

  // ---------- Derived state: Signal Fusion recalculates on every simulation change ----------
  const assessments = useMemo(() => assessAll(sim), [sim]);
  const markers = useMemo(
    () =>
      Object.fromEntries(
        RESIDENTS.map((r) => [r.id, markerFor(r, sim, assessments[r.id])]),
      ) as Record<string, MarkerState>,
    [sim, assessments],
  );
  const active = sim.incident.status === "active";
  const unresolved = active ? RESIDENTS.filter((r) => markers[r.id] !== "safe") : [];
  const elmUnconfirmed = unresolved.length;
  const reviewNow = RESIDENTS.filter((r) => {
    const a = assessments[r.id];
    return active && a && levelRank(a.level) >= levelRank("high");
  });
  const inOutage = unresolved.filter((r) => activeOutagesAt(r, sim.outages).length > 0);
  const ordered = useMemo(() => queueOrder(assessments), [assessments]);
  const queue = ordered.filter(
    (r) =>
      matchesSearch(r, search) &&
      matchesFilter(r, filter, sim, assessments[r.id], markers[r.id]) &&
      (filter === "resolved" || assessments[r.id]?.level !== "resolved"),
  );
  const visible = useMemo(
    () =>
      new Set(
        RESIDENTS.filter(
          (r) =>
            matchesSearch(r, search) &&
            (filter === "all" || matchesFilter(r, filter, sim, assessments[r.id], markers[r.id])),
        ).map((r) => r.id),
      ),
    [search, filter, sim, assessments, markers],
  );
  const activeDistrict = DISTRICTS.find((d) => d.id === district);
  const person = RESIDENTS.find((r) => r.id === selected);
  const phonePerson = RESIDENTS.find((r) => r.id === phone);
  const ranked = [...DISTRICTS].sort(
    (a, b) => districtCount(b, elmUnconfirmed) - districtCount(a, elmUnconfirmed),
  );

  // ---------- Simulation clock ----------
  useEffect(() => {
    if (!sim.running) return;
    const tickMs = 250;
    const id = setInterval(() => {
      acc.current += (60 / sim.secondsPerSimHour) * (tickMs / 1000);
      const whole = Math.floor(acc.current);
      if (whole > 0) {
        acc.current -= whole;
        dispatch({ type: "advance", minutes: whole });
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [sim.running, sim.secondsPerSimHour]);

  // ---------- Backend wiring ----------
  useEffect(() => {
    void health().then(setIntegrations);
    void loadShelters().then(setShelters);
  }, []);
  const aiConfigured = Boolean(integrations?.nemotron || integrations?.gemini);
  // Upgrade rules-based classifications with Nemotron / Gemini when configured.
  useEffect(() => {
    for (const id of sim.enrich) {
      if (enriching.current.has(id)) continue;
      enriching.current.add(id);
      const m = sim.messages.find((x) => x.id === id);
      if (!m || !aiConfigured) {
        dispatch({ type: "enrich_done", messageId: id });
        continue;
      }
      void classify(m.text, m.residentId).then((c) =>
        dispatch(
          c.provider === "rules"
            ? { type: "enrich_done", messageId: id }
            : { type: "enriched", messageId: id, classification: c },
        ),
      );
    }
  }, [sim.enrich, sim.messages, aiConfigured]);
  // Inbound replies persisted by /api/webhook (Supabase configured only).
  useEffect(() => {
    if (!integrations?.supabase) return;
    const seen = new Set<string>();
    let since = new Date().toISOString();
    const id = setInterval(async () => {
      for (const row of await inbox(since)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        since = row.created_at;
        const parsed = ClassificationResultSchema.safeParse(row.classification);
        dispatch({
          type: "reply",
          residentId: row.resident_id,
          text: row.reply,
          ...(parsed.success ? { classification: parsed.data } : {}),
        });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [integrations?.supabase]);

  function later(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }
  function clearPending(id: string) {
    setPending((x) => {
      const n = { ...x };
      delete n[id];
      return n;
    });
  }
  function openPerson(id: string) {
    setSelected(id);
    setDrawer(true);
  }
  /** Coordinator approval of a third-party step (3 contact, 4 neighbor, 5 welfare review). */
  function approveAction(r: Resident, stage: 3 | 4 | 5 | null) {
    if (stage === null) return openPerson(r.id);
    dispatch({ type: "approve", residentId: r.id, stage, by: COORDINATOR });
    void recordEscalation(r.id, stage, COORDINATOR);
    setSelected(r.id);
    if (stage === 4) {
      setDrawer(false);
      setPhone(r.id);
      setPhoneMode("neighbor");
      setWalking(r.id);
      setPending((x) => ({ ...x, [r.id]: `Waiting for ${r.neighbor.name.split(" ")[0]}` }));
      setReplies((x) => {
        const next = { ...x };
        delete next[r.id];
        return next;
      });
    } else if (stage === 3) {
      setDrawer(false);
      setPhone(r.id);
      setPhoneMode("contact");
      setReplies((x) => {
        const next = { ...x };
        delete next[r.id];
        return next;
      });
      setPending((x) => ({ ...x, [r.id]: `Calling ${r.emergencyContact.name}…` }));
      later(1800, () => {
        const scripted = CONTACT_RESPONSES[r.id];
        const text = scripted ?? "No answer — left a voicemail.";
        setReplies((x) => ({ ...x, [r.id]: text }));
        setNoAnswer((x) => ({ ...x, [r.id]: !scripted }));
        dispatch({
          type: "confirm",
          residentId: r.id,
          by: "contact",
          outcome: scripted ? "safe" : "noAnswer",
          text,
        });
        clearPending(r.id);
      });
    } else {
      setDrawer(true);
    }
  }
  function answer(id: string, value: "okay" | "help" | "none") {
    const r = RESIDENTS.find((r) => r.id === id);
    if (!r) return;
    const message =
      value === "okay"
        ? r.id === "412"
          ? "She's okay"
          : "They're okay"
        : value === "help"
          ? "Needs help"
          : "No answer";
    setReplies((x) => ({ ...x, [id]: message }));
    setWalking(null);
    clearPending(id);
    dispatch({
      type: "confirm",
      residentId: id,
      by: "neighbor",
      outcome: value === "okay" ? "safe" : value === "help" ? "needsHelp" : "noAnswer",
      text: message,
    });
  }
  async function simulateReply(text: string) {
    if (!person) return;
    setBusy(true);
    const c = await classify(text, person.id);
    dispatch({ type: "reply", residentId: person.id, text, classification: c });
    setBusy(false);
  }

  async function sendRealCheckin() {
    if (!person || !integrations?.photon || integrations.photonResidentId !== person.id) return;
    setBusy(true);
    try {
      const out = await sendCheckin(person.id);
      if (out.delivery.provider !== "photon") throw new Error("Photon delivery was not used");
      setRealMessages((messages) => [
        ...messages,
        {
          id: out.delivery.messageId || `photon-${Date.now()}`,
          residentId: person.id,
          at: sim.now,
          direction: "out",
          channel: "sms",
          text: out.text,
          from: "doorstep",
          status: out.delivery.status,
          provider: "photon",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Scripted demo (Events 1–9) ----------
  function stopDemo() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDemo(false);
    setDemoStep(0);
    setDemoCaption("");
    dispatch({ type: "set_running", running: false });
  }
  function runDemo() {
    stopDemo();
    dispatch({ type: "reset" });
    dispatch({ type: "set_speed", secondsPerSimHour: 10 });
    dispatch({ type: "set_running", running: true });
    setDemo(true);
    setDemoStep(1);
    setDistrict(null);
    setFilter("all");
    setSearch("");
    setReplies({});
    setNoAnswer({});
    setPending({});
    setSelected(null);
    setDrawer(false);
    setPhone(null);
    setWalking(null);
  }
  useEffect(() => {
    if (!demo) return;
    const caption = [...DEMO_CAPTIONS].find(([t]) => sim.now < t)?.[1];
    if (caption && demoStep < 6) setDemoCaption(caption);
    if (demoStep === 1 && sim.now >= 6) {
      setDistrict("elm");
      setStreetView(false);
      setDemoStep(2);
    } else if (demoStep === 2 && sim.now >= 96) {
      openPerson("441");
      setDemoStep(3);
    } else if (demoStep === 3 && sim.now >= 128) {
      setDrawer(false);
      setSelected(null);
      setDemoStep(4);
    } else if (demoStep === 4 && sim.now >= 186) {
      dispatch({ type: "set_running", running: false });
      setDemoStep(6);
      setDemoCaption("Event 9 · Coordinator approves a neighbor check for Mrs. Lopez");
      setSelected("412");
      later(1500, () => {
        const r = RESIDENTS.find((x) => x.id === "412");
        if (r) approveAction(r, 4);
      });
      later(4500, () => {
        answer("412", "okay");
        setDemoCaption("Neighbor confirmed Mrs. Lopez is safe · silence escalation stopped");
      });
      later(8000, () => {
        setDemo(false);
        setDemoStep(0);
        setDemoCaption("");
        setPhone(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, demoStep, sim.now]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const hoursAgo = Math.max(0, sim.now);
  const funnel = [
    {
      label: "Residents in the storm's path",
      value: CITY_TOTAL,
      width: "100%",
      color: "bg-unknown",
      text: "text-foreground",
    },
    {
      label: "Accounted for",
      value: active ? accountedFor(elmUnconfirmed) : 0,
      width: active ? "97%" : "0%",
      color: "bg-safe",
      text: "text-foreground",
    },
    {
      label: "Still unconfirmed",
      value: active ? OTHER_DISTRICTS_UNCONFIRMED + elmUnconfirmed : 0,
      width: "53%",
      color: "bg-primary",
      text: "text-primary",
    },
    {
      label: "Unresolved inside outage zones",
      value: inOutage.length,
      width: "30%",
      color: "bg-alert",
      text: "text-alert",
    },
    {
      label: "Urgent / high review",
      value: reviewNow.length,
      width: "12%",
      color: "bg-danger",
      text: "text-danger",
    },
  ];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <span className="brand-mark grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <House className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">
              Doorstep<span className="text-primary">.</span>
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              State Farm · Catastrophe response
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
          <span className="text-xl font-bold italic tracking-tight text-brand">
            State Farm<sup className="ml-0.5 text-[10px] not-italic">®</sup>
          </span>
          <span className="mx-3 text-border">/</span> Richardson operations
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className={cn("size-1.5 rounded-full", sim.running ? "bg-safe" : "bg-unknown")} />{" "}
            {sim.running ? "Simulation running" : "Simulation paused"}
          </span>
          <LiquidButton variant="primary" onClick={demo ? stopDemo : runDemo} className="h-10 px-5">
            {demo ? <Square /> : <Play />} {demo ? "Stop demo" : "Run demo"}
          </LiquidButton>
          <span className="operator-avatar hidden size-9 items-center justify-center rounded-full border border-border text-xs font-semibold md:flex">
            MS
          </span>
        </div>
      </header>
      <div className="incident-summary flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <CloudLightning className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {active ? "Storm hit Richardson, TX" : "Storm approaching Richardson, TX"}{" "}
              <span className="font-normal text-muted-foreground">
                ·{" "}
                {active
                  ? `${Math.floor(hoursAgo / 60)}h ${hoursAgo % 60}m ago`
                  : "incident not yet opened"}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sim.incident.startedLabel} · {sim.incident.type} · {sim.incident.id}
            </p>
          </div>
        </div>
        <SimControls sim={sim} dispatch={dispatch} disabled={demo} />
        <div className="flex items-center gap-4" aria-live="polite">
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums">
              {active ? accountedFor(elmUnconfirmed).toLocaleString() : "—"}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of {CITY_TOTAL.toLocaleString()}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">accounted for</p>
          </div>
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden text-right sm:block">
            <p className="text-xl font-semibold text-danger">
              {active ? OTHER_DISTRICTS_UNCONFIRMED + elmUnconfirmed : "—"}
            </p>
            <p className="text-xs text-muted-foreground">still unconfirmed</p>
          </div>
        </div>
      </div>
      <main className="dashboard-workspace">
        <section className="map-area" aria-label="Texas response heatmap">
          <ClientOnly
            fallback={
              <div className="grid h-full place-items-center text-muted-foreground">
                Loading Texas map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-muted-foreground">
                  Loading Texas map…
                </div>
              }
            >
              <ResponseMap
                district={district}
                markers={markers}
                assessments={assessments}
                outages={sim.outages}
                elmUnconfirmed={elmUnconfirmed}
                visible={visible}
                heatmap={heatmap}
                selected={selected}
                walking={walking}
                onDistrict={setDistrict}
                onSelect={openPerson}
              />
            </Suspense>
          </ClientOnly>
          {district === "elm" && streetView && (
            <StreetView
              markers={markers}
              assessments={assessments}
              visible={visible}
              selected={selected}
              onSelect={openPerson}
            />
          )}
          {district === "elm" && (
            <div className="map-float bottom-5 right-5 flex gap-2">
              {!streetView && (
                <LiquidButton
                  className="text-xs"
                  onClick={() => setHeatmap((v) => !v)}
                  aria-pressed={heatmap}
                >
                  <Flame /> {heatmap ? "Hide" : "Show"} silence heatmap
                </LiquidButton>
              )}
              <LiquidButton className="text-xs" onClick={() => setStreetView((v) => !v)}>
                {streetView ? "Show map" : "Show street view"}
              </LiquidButton>
            </div>
          )}
          <div className="map-float left-5 top-5 flex items-center gap-3 rounded-lg px-4 py-3">
            <MapPin className="size-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">{activeDistrict?.name ?? "Texas"}</p>
              <p className="text-[11px] text-muted-foreground">
                {district === "elm"
                  ? `${RESIDENTS.length} households · Elm Street`
                  : district
                    ? `${activeDistrict?.totalResidents.toLocaleString()} residents`
                    : "Richardson response · 9 neighborhoods"}
              </p>
            </div>
            {district && (
              <Button
                variant="ghost"
                size="icon"
                title="Back to Texas"
                aria-label="Back to Texas"
                onClick={() => {
                  setDistrict(null);
                  setSelected(null);
                }}
              >
                <ArrowLeft />
              </Button>
            )}
          </div>
          <div className="map-float left-5 bottom-10 max-w-[calc(100%-40px)] rounded-lg px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {district === "elm" ? "Household status" : "Response density"}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
              {district === "elm" ? (
                <>
                  <LegendDot tone="bg-safe" text="Confirmed safe" />
                  <LegendDot tone="bg-alert" text="Needs assistance" />
                  <LegendDot tone="border-2 border-danger bg-card" text="Urgent review" />
                  <LegendDot tone="bg-light" text="Awaiting reply" />
                  <LegendDot tone="border border-unknown" text="Away ↗" />
                  <LegendDot tone="bg-unknown" text="Unknown ?" />
                  {sim.outages.length > 0 && (
                    <LegendDot
                      tone="border border-dashed border-alert bg-alert/20"
                      text="Simulated outage"
                    />
                  )}
                </>
              ) : (
                <div>
                  <div
                    className="heatmap-scale"
                    role="img"
                    aria-label="Relative density of people silent at home, from low in peach to high in red"
                  />
                  <div className="mt-1.5 flex justify-between text-muted-foreground">
                    <span>Lower</span>
                    <span>Higher</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    Silent at home · Richardson demo data
                  </p>
                </div>
              )}
            </div>
          </div>
          {demo && demoCaption && (
            <div
              className="map-float bottom-32 left-5 rounded-lg px-4 py-3 text-xs text-primary"
              aria-live="polite"
            >
              <Radio className="mr-2 inline size-4" />
              {demoCaption}
            </div>
          )}
          <span className="map-float right-5 top-5 hidden items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-muted-foreground sm:flex">
            <Layers className="size-3.5" />
            {district ? "Neighborhood view" : "Texas heatmap"}
          </span>
        </section>
        <aside
          className="response-panel"
          aria-label={district ? "Priority queue" : "City priorities"}
        >
          {!district ? (
            <>
              <section className="response-overview border-b border-border p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">From city to doorstep</h2>
                  <Crosshair className="size-4 text-primary" />
                </div>
                <div className="space-y-4">
                  {funnel.map((f, i) => (
                    <div key={f.label}>
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{f.label}</span>
                        <span className={cn("text-lg font-semibold tabular-nums", f.text)}>
                          {f.value.toLocaleString()}
                        </span>
                      </div>
                      <motion.div
                        key={`${f.label}-${demo}`}
                        className={cn("funnel-bar", f.color)}
                        initial={{ width: 0 }}
                        animate={{ width: f.value ? f.width : "0%" }}
                        transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.15 }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-5 flex items-center gap-2 text-xs text-danger">
                  <Footprints className="size-4" />
                  {reviewNow.length} households need review first
                </p>
              </section>
              <section className="p-6">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-base font-semibold">Send responders here first</h2>
                  <ArrowDown className="size-4 text-muted-foreground" />
                </div>
                <p className="mb-5 text-xs text-muted-foreground">
                  Ranked by unconfirmed households
                </p>
                <div className="space-y-1">
                  {ranked.map((d, i) => {
                    const count = districtCount(d, elmUnconfirmed);
                    return (
                      <Button
                        key={d.id}
                        variant="ghost"
                        onClick={() => setDistrict(d.id)}
                        className="district-row h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-3 py-3"
                      >
                        <span className="w-4 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            urgency(count) === "red"
                              ? "bg-danger"
                              : urgency(count) === "orange"
                                ? "bg-alert"
                                : count
                                  ? "bg-primary"
                                  : "bg-unknown",
                          )}
                        />
                        <span className="flex-1 text-left text-sm">{d.name}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
                        <ChevronRight className="text-muted-foreground" />
                      </Button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="border-b border-border px-6 py-5">
                <Button
                  variant="link"
                  className="mb-3 h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => {
                    setDistrict(null);
                    setSelected(null);
                  }}
                >
                  <ArrowLeft /> Back to Texas
                </Button>
                <h2 className="text-xl font-semibold">Priority queue</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeDistrict?.name} ·{" "}
                  {district === "elm"
                    ? `${elmUnconfirmed} unconfirmed · ${reviewNow.length} urgent/high · ${inOutage.length} in outage zones`
                    : `${activeDistrict?.silentAtHome} unconfirmed`}
                </p>
              </section>
              {district === "elm" ? (
                <PriorityQueue
                  people={queue}
                  sim={sim}
                  assessments={assessments}
                  markers={markers}
                  filter={filter}
                  search={search}
                  selected={selected}
                  pending={pending}
                  resolvedCount={
                    RESIDENTS.filter((r) => assessments[r.id]?.level === "resolved").length
                  }
                  onFilter={setFilter}
                  onSearch={setSearch}
                  onOpen={openPerson}
                  onAct={approveAction}
                />
              ) : (
                <section className="p-6">
                  <p className="text-sm text-muted-foreground">
                    {activeDistrict?.silentAtHome} residents unconfirmed (static demo count)
                  </p>
                  <p className="mt-4 text-sm">Response team reviewing this district.</p>
                  <Button
                    onClick={() => setDistrict("elm")}
                    variant="outline"
                    className="mt-5 w-full"
                  >
                    Open Elm household demo <ArrowRight />
                  </Button>
                </section>
              )}
            </>
          )}
          <section
            className="border-t border-border px-6 py-4"
            aria-label="Coordinator activity log"
          >
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Activity log
            </h3>
            <ol className="max-h-56 space-y-2 overflow-y-auto text-xs" aria-live="polite">
              {sim.logs
                .slice(-14)
                .reverse()
                .map((l) => (
                  <li key={l.id} className="flex gap-2">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                      {wallClock(l.at)}
                    </span>
                    <button
                      type="button"
                      disabled={!l.residentId}
                      onClick={() => l.residentId && (setDistrict("elm"), openPerson(l.residentId))}
                      className={cn(
                        "text-left",
                        l.kind === "outage" && "text-alert",
                        l.kind === "fusion" && "text-primary",
                        l.kind === "escalation" &&
                          l.text.startsWith("URGENT") &&
                          "font-semibold text-danger",
                        l.residentId && "hover:underline",
                      )}
                    >
                      {l.text}
                    </button>
                  </li>
                ))}
              {!sim.logs.length && (
                <li className="text-muted-foreground">
                  Waiting for the incident to open. Press Start.
                </li>
              )}
            </ol>
          </section>
          <footer className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Synthetic residents · simulated Ting outages ·{" "}
            {integrations?.photon ? "Photon messaging" : "mock messaging"} · AI:{" "}
            {integrations?.nemotron ? "Nemotron" : integrations?.gemini ? "Gemini" : "rules"} ·{" "}
            {formatClock(sim.now)}
          </footer>
        </aside>
      </main>
      <AnimatePresence>
        {phonePerson && (
          <motion.aside
            role="dialog"
            aria-label="Text conversation"
            initial={{ y: 70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 70, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            className="phone-frame fixed bottom-5 right-5 z-[450] w-[300px] max-w-[calc(100vw-40px)] p-3"
          >
            <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-border" />
            <div className="rounded-[20px] bg-card p-4">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="size-4" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {phoneMode === "neighbor"
                      ? phonePerson.neighbor.name
                      : phonePerson.emergencyContact.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {phoneMode === "neighbor"
                      ? "Opted-in neighbor · English"
                      : "Emergency contact · phone call"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close phone"
                  onClick={() => setPhone(null)}
                >
                  <X />
                </Button>
              </div>
              <p className="mb-4 text-center text-[10px] text-muted-foreground">
                Saturday · {wallClock(sim.now)}
              </p>
              <p className="rounded-lg rounded-tl-none bg-secondary p-3 text-sm leading-relaxed">
                {phoneMode === "neighbor"
                  ? `Hi ${phonePerson.neighbor.name.split(" ")[0]}, can you check on ${phonePerson.shortName} at ${phonePerson.address.replace(" St", "")}? ${phonePerson.id === "412" ? "She's" : "They're"} ${phonePerson.age}${phonePerson.livesAlone ? " and lives alone" : ""}.`
                  : `Calling ${phonePerson.emergencyContact.name} to check on ${phonePerson.shortName}…`}
              </p>
              {replies[phonePerson.id] ? (
                <>
                  <p className="ml-8 mt-4 rounded-lg rounded-br-none bg-primary p-3 text-sm text-primary-foreground">
                    {replies[phonePerson.id]}
                  </p>
                  <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3" /> Response recorded
                  </p>
                  {(replies[phonePerson.id] === "No answer" || noAnswer[phonePerson.id]) &&
                    !sim.welfare[phonePerson.id] && (
                      <LiquidButton
                        variant="destructive"
                        className="mt-3 w-full"
                        onClick={() => {
                          setPhone(null);
                          approveAction(phonePerson, 5);
                        }}
                      >
                        Approve welfare-check review
                      </LiquidButton>
                    )}
                </>
              ) : phoneMode === "neighbor" ? (
                <div className="mt-5 space-y-2">
                  <LiquidButton
                    variant="primary"
                    data-okay
                    onClick={() => answer(phonePerson.id, "okay")}
                    className="h-11 w-full"
                  >
                    <Check />
                    {phonePerson.id === "412" ? "She's okay" : "They're okay"}
                  </LiquidButton>
                  <Button
                    variant="secondary"
                    onClick={() => answer(phonePerson.id, "help")}
                    className="h-11 w-full text-alert"
                  >
                    Needs help
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => answer(phonePerson.id, "none")}
                    className="h-11 w-full"
                  >
                    No answer
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-primary">Connecting…</p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <Sheet open={drawer && Boolean(person)} onOpenChange={setDrawer}>
        <SheetContent className="resident-sheet w-full overflow-y-auto sm:max-w-md">
          {person && assessments[person.id] && (
            <ResidentDetail
              person={person}
              sim={sim}
              assessment={assessments[person.id]!}
              shelters={shelters}
              busy={busy || Boolean(pending[person.id])}
              realMessages={realMessages}
              canSendRealCheckin={Boolean(
                integrations?.photon && integrations.photonResidentId === person.id,
              )}
              onSendRealCheckin={sendRealCheckin}
              onApprove={approveAction}
              onSimulateReply={simulateReply}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
function LegendDot({ tone, text }: { tone: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", tone)} />
      {text}
    </span>
  );
}
