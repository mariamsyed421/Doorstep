import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Flame,
  Footprints,
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  RESIDENTS,
  DISTRICTS,
  districtCount,
  accountedFor,
  unconfirmed,
  COUNTIES_BY_PRIORITY,
  COUNTY_BY_GEOID,
  DEMO_COUNTY,
  TEXAS_TOTALS,
  countySilentAtHome,
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
import { DoorstepBear, MapLoadingState } from "./DoorstepBear";
import { IncidentGuide } from "./IncidentGuide";
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
  const [county, setCounty] = useState<string | null>(null);
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
    (a, b) => districtCount(b, resolved) - districtCount(a, resolved),
  );
  const resolvedHome = RESIDENTS.filter(
    (r) =>
      r.planAnswer === "home" &&
      r.checkInStatus === "silent" &&
      resolved[r.id] &&
      resolved[r.id] !== "silent",
  ).length;
  const activeCounty = county ? COUNTY_BY_GEOID.get(county) : undefined;
  const topCounties = COUNTIES_BY_PRIORITY.slice(0, 12);
  const funnel = activeCounty ?? TEXAS_TOTALS;
  // Elm Street confirmations only change the Dallas County and statewide figures.
  const funnelResolved = !activeCounty || activeCounty.geoid === DEMO_COUNTY ? resolvedHome : 0;
  const knockFirst = Math.max(0, funnel.liveAloneSilent - funnelResolved);
  function backToTexas() {
    setDistrict(null);
    setCounty(null);
    setSelected(null);
  }
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
    setCounty(null);
    setResolved({});
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
      setDemoPhase(3);
    }
    later(6500, () => {
      const r = RESIDENTS.find((r) => r.id === "412");
      if (r) act(r);
      setDemoPhase(4);
    });
    later(9500, () => {
      answer("412", "okay");
      setDemoPhase(5);
    });
    later(11500, () => {
      // The city-wide response team confirms the other high-priority homes in parallel.
      setResolved((x) => ({
        ...x,
        "438": "safe",
        "452": "safe",
      }));
      setPhone(null);
      setWalking(null);
      setSelected(null);
      setDistrict(null);
      setCounty(null);
      setDemoPhase(6);
      ["438", "452"].forEach((id) => addLog(id, "Responder team confirmed safe", "5:16pm"));
    });
    later(14000, () => {
      setDemo(false);
      setDemoPhase(0);
        });
  }, [demo, demoStep, sim.now]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const hoursAgo = Math.max(0, sim.now);
 const unconfirmedTotal = active ? unconfirmed(resolved) : 0;
  const nextHome = ordered.find(
    (r) =>
      active &&
      !pending[r.id] &&
      !sim.welfare[r.id] &&
      assessments[r.id] &&
      levelRank(assessments[r.id]!.level) >= levelRank("high"),
  );
  const counts = [
  { label: "Residents in the storm's path", value: TEXAS_TOTALS.enrolled },
  { label: "Accounted for", value: active ? accountedFor(resolved) : 0 },
  { label: "Still unconfirmed", value: unconfirmedTotal },
  { label: "Unresolved inside outage zones", value: inOutage.length },
  { label: "Urgent / high review", value: reviewNow.length },
];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="flex min-w-0 items-center gap-3">
          <DoorstepBear className="size-10" />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Doorstep<span className="text-brand">.</span>
            </h1>
            <p className="text-[11px] text-muted-foreground">Catastrophe response</p>
          </div>
        </div>
        <div className="header-context">
          <span className="text-sm font-medium">Texas operations</span>
          <span className="text-xs text-muted-foreground">State Farm</span>
        </div>
        <div className="header-actions flex items-center gap-3 md:gap-5">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span
              className={cn("size-1.5 rounded-full", sim.running ? "bg-brand" : "bg-unknown")}
            />
            {sim.running ? "Simulation running" : "Simulation paused"}
          </span>
          <Button onClick={demo ? stopDemo : runDemo} className="h-11 gap-2 px-4">
            {demo ? <Square /> : <Play />} {demo ? "Stop demo" : "Run demo"}
          </Button>
          <span
            className="operator-avatar hidden size-9 items-center justify-center rounded-md border border-border text-xs font-semibold lg:flex"
            aria-label="Operator MS"
          >
            MS
          </span>
        </div>
      </header>
      <div className="incident-summary">
        <div className="incident-heading">
          <p className="section-kicker">
            Storm response <span className="text-border">/</span> Statewide
          </p>
          <h2 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]">
            Texas
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Squall line from Wichita Falls through Dallas to Tyler · Saturday, November 7 · 3 hours
            ago · {TEXAS_TOTALS.outages.toLocaleString()} without power
          </p>
        </div>
        <IncidentGuide
          priorityCount={priorityHomes.length}
          unconfirmed={unconfirmed(resolved)}
          pendingCount={silent.filter((r) => Boolean(pending[r.id])).length}
          nextHome={nextHome}
          demo={demo}
          onReview={() => {
            if (!nextHome) return;
            setDistrict("elm");
            setStreetView(false);
            openPerson(nextHome.id);
          }}
        />
        <div className="incident-totals" aria-live="polite">
          <div>
            <p className="incident-number">
              {accountedFor(resolved).toLocaleString()}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                / {TEXAS_TOTALS.enrolled.toLocaleString()}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Residents accounted for</p>
          </div>
          <div className="incident-unconfirmed">
            <p className="incident-number text-danger">{unconfirmed(resolved).toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Still unconfirmed</p>
          </div>
        </div>
      </div>
      <main className="dashboard-workspace">
        <section className="map-area" aria-label="Texas response heatmap">
          <ClientOnly fallback={<MapLoadingState />}>
            <Suspense fallback={<MapLoadingState />}>
              <ResponseMap
                district={district}
                county={county}
                onCounty={setCounty}
                resolved={resolved}
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
                <Button
                  variant="outline"
                  className="text-xs"
                  onClick={() => setHeatmap((v) => !v)}
                  aria-pressed={heatmap}
                >
                  <Flame /> {heatmap ? "Hide" : "Show"} silence heatmap
                </Button>
              )}
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => setStreetView((v) => !v)}
              >
                {streetView ? "Show map" : "Show street view"}
              </Button>
            </div>
          )}
          <div className="map-float left-5 top-5 flex items-center gap-3 rounded-lg px-4 py-3">
            <MapPin className="size-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                {activeDistrict?.name ?? (activeCounty ? `${activeCounty.name} County` : "Texas")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {district === "elm"
                  ? `${RESIDENTS.length} households · Elm Street`
                  : district
                    ? `${activeDistrict?.totalResidents.toLocaleString()} residents`
                    : activeCounty
                      ? `${activeCounty.enrolled.toLocaleString()} enrolled residents`
                      : `254 counties · ${TEXAS_TOTALS.enrolled.toLocaleString()} enrolled`}
              </p>
            </div>
            {(district || county) && (
              <Button
                variant="ghost"
                size="icon"
                title="Back to Texas"
                aria-label="Back to Texas"
                onClick={backToTexas}
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
                  <p className="mt-2 text-muted-foreground">Silent at home by county · mock data</p>
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
            {district ? "Neighborhood view" : county ? "County view" : "Texas heatmap"}
          </span>
        </section>
        <aside
          className="response-panel"
          aria-label={
            district ? "Where to look" : county ? "County priorities" : "Statewide priorities"
          }
        >
          {!district ? (
            <>
              <section className="response-overview border-b border-border p-6">
                <div className="mb-6">
                  <p className="section-kicker mb-2">
                    01 <span className="text-border">/</span> Response overview
                  </p>
                  <h2 className="font-display text-[23px] font-semibold leading-tight tracking-tight">
                    {activeCounty ? `${activeCounty.name} County` : "From state to doorstep"}
                  </h2>
                  {activeCounty && (
                    <Button
                      variant="link"
                      className="mt-1 h-auto p-0 text-xs text-muted-foreground"
                      onClick={backToTexas}
                    >
                      <ArrowLeft /> Back to Texas
                    </Button>
                  )}
                </div>
                <dl className="response-counts">
                  {[
                    { label: "Residents in the storm's path", value: funnel.enrolled },
                    {
                      label: "Replied safe",
                      value: funnel.enrolled - funnel.silent + funnelResolved,
                    },
                    { label: "Silent after check-in", value: funnel.silent - funnelResolved },
                    {
                      label: "Said they'd be home",
                      value: Math.max(0, funnel.silentAtHome - funnelResolved),
                    },
                    { label: "Home + vulnerable", value: knockFirst },
                  ].map((item, index) => (
                    <div
                      key={item.label}
                      className={cn(
                        "response-count-row",
                        index === 4 && "response-count-row--priority",
                      )}
                    >
                      <dt>{item.label}</dt>
                      <dd>{item.value.toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>
                <p
                  className={cn(
                    "priority-note mt-5 flex items-start gap-2 text-xs leading-relaxed",
                    knockFirst ? "text-danger" : "text-foreground",
                  )}
                >
                  {knockFirst ? (
                    <Footprints className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <Check className="mt-0.5 size-4 shrink-0" />
                  )}
                  {knockFirst
                    ? `${knockFirst.toLocaleString()} people need a knock first`
                    : "Priority home checks are complete"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {funnel.outages.toLocaleString()} customers without power
                </p>
              </section>
              {!activeCounty || activeCounty.geoid === DEMO_COUNTY ? (
                <section className="p-6">
                  <p className="section-kicker mb-2">
                    02 <span className="text-border">/</span>{" "}
                    {activeCounty ? "Neighborhood queue" : "County queue"}
                  </p>
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    {activeCounty ? "Richardson neighborhoods" : "Send responders here first"}
                  </h2>
                  <p className="mb-5 mt-2 text-xs leading-relaxed text-muted-foreground">
                    Ranked by people silent at home.
                  </p>
                  <div className="queue-column-heads flex justify-between border-b border-border pb-2 text-[11px] text-muted-foreground">
                    <span>{activeCounty ? "Neighborhood" : "County"}</span>
                    <span>Unconfirmed</span>
                  </div>
                  <div>
                    {activeCounty
                      ? ranked.map((d, i) => (
                          <QueueRow
                            key={d.id}
                            rank={i + 1}
                            name={d.name}
                            count={districtCount(d, resolved)}
                            onClick={() => setDistrict(d.id)}
                          />
                        ))
                      : topCounties.map((c, i) => (
                          <QueueRow
                            key={c.geoid}
                            rank={i + 1}
                            name={`${c.name} County`}
                            count={countySilentAtHome(c, resolved)}
                            onClick={() => setCounty(c.geoid)}
                          />
                        ))}
                  </div>
                  {!activeCounty && (
                    <p className="mt-4 text-[11px] text-muted-foreground">
                      Pick any of the 254 counties on the map or from the county menu.
                    </p>
                  )}
                </section>
              ) : (
                <section className="p-6">
                  <p className="section-kicker mb-2">
                    02 <span className="text-border">/</span> County status
                  </p>
                  <p className="text-sm">
                    Storm severity{" "}
                    <span className="font-semibold">
                      {Math.round(activeCounty.severity * 100)}%
                    </span>{" "}
                    · {activeCounty.population.toLocaleString()} residents
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeCounty.silentAtHome
                      ? "County response team is working through check-ins."
                      : "No one silent at home. Monitoring only."}
                  </p>
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
          ) : (
            <>
              <section className="border-b border-border px-6 py-5">
                <Button
                  variant="link"
                  className="mb-3 h-auto p-0 text-xs text-muted-foreground"
                  onClick={backToTexas}
                >
                  <ArrowLeft /> Back to Texas
                </Button>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  Priority queue
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeDistrict?.name} ·{" "}
                  {district === "elm"
                    ? `${elmUnconfirmed} unconfirmed · ${reviewNow.length} urgent/high · ${inOutage.length} in outage zones`
                    : `${activeDistrict?.silentAtHome} unconfirmed`}
                </p>
              </section>
              {district === "elm" ? (
                <>
                  {active && elmUnconfirmed === 0 && (
                    <div className="queue-empty border-b border-border px-6 py-6" role="status">
                      <DoorstepBear variant="mascot" className="mb-4 h-20 w-16" />
                      <h3 className="font-display text-xl font-semibold">
                        No unanswered check-ins
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Every household in this queue has a recorded response or an assigned welfare
                        check.
                      </p>
                    </div>
                  )}
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
                </>
              ) : (
                <section className="p-6">
                  <p className="text-sm text-muted-foreground">
                    {activeDistrict?.silentAtHome} residents unconfirmed (static demo count)
                  </p>
                  <div className="mascot-note mt-6 border-y border-border py-6">
                    <DoorstepBear variant="mascot" className="mb-4 h-20 w-16" />
                    <h3 className="font-display text-xl font-semibold">Neighborhood overview</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Household-level detail is available in the Elm demo.
                    </p>
                  </div>
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
          <footer className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4 text-[11px] text-muted-foreground">
            <DoorstepBear className="size-6" /> Doorstep
            <span className="ml-auto text-right">
              Synthetic residents · simulated Ting outages ·{" "}
              {integrations?.photon ? "Photon messaging" : "mock messaging"} · AI:{" "}
              {integrations?.nemotron ? "Nemotron" : integrations?.gemini ? "Gemini" : "rules"} ·{" "}
              {formatClock(sim.now)}
            </span>
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
            className="phone-frame fixed bottom-5 right-5 z-[450] w-[340px] max-w-[calc(100vw-40px)]"
          >
            <div className="bg-card p-5">
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <DoorstepBear className="size-5" /> Doorstep check-in
                </span>
                <span>Saturday · {wallClock(sim.now)}</span>
              </div>
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
                      <Button
                        variant="destructive"
                        className="mt-3 w-full"
                        onClick={() => {
                          setPhone(null);
                          approveAction(phonePerson, 5);
                        }}
                      >
                        Approve welfare-check review
                      </Button>
                    )}
                </>
              ) : phoneMode === "neighbor" ? (
                <div className="mt-5 space-y-2">
                  <Button
                    variant="default"
                    data-okay
                    onClick={() => answer(phonePerson.id, "okay")}
                    className="h-11 w-full"
                  >
                    <Check />
                    {phonePerson.id === "412" ? "She's okay" : "They're okay"}
                  </Button>
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
function QueueRow({
  rank,
  name,
  count,
  onClick,
}: {
  rank: number;
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="district-row h-auto min-h-14 w-full justify-start gap-3 rounded-none px-0 py-4"
    >
      <span className="w-5 font-mono text-[11px] text-muted-foreground">
        {String(rank).padStart(2, "0")}
      </span>
      <span className="flex-1 text-left text-sm">{name}</span>
      <span className="text-base font-semibold tabular-nums text-foreground">
        {count.toLocaleString()}
      </span>
      <ChevronRight className="text-muted-foreground" />
    </Button>
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
