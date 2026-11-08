import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CloudLightning,
  Crosshair,
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
  Phone as PhoneIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  RESIDENTS,
  DISTRICTS,
  groupFor,
  planLabel,
  districtCount,
  accountedFor,
  urgency,
  type Resident,
  type Resolutions,
  type ResponseStatus,
} from "@/lib/doorstep-data";
import { cn } from "@/lib/utils";
import { StreetView } from "./StreetView";
const ResponseMap = lazy(() => import("./ResponseMap"));
type Log = { time: string; text: string };
const groups = [
  { key: "check", title: "Check the house now", tone: "text-danger", border: "border-danger/50" },
  { key: "call", title: "Call their contact", tone: "text-primary", border: "border-primary/40" },
  { key: "unknown", title: "Unknown", tone: "text-muted-foreground", border: "border-border" },
] as const;
export function Dashboard() {
  const [district, setDistrict] = useState<string | null>(null);
  const [streetView, setStreetView] = useState(true);
  const [resolved, setResolved] = useState<Resolutions>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<"neighbor" | "contact">("neighbor");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<Record<string, Log[]>>({});
  const [walking, setWalking] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoPhase, setDemoPhase] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduce = useReducedMotion();
  const activeDistrict = DISTRICTS.find((d) => d.id === district);
  const person = RESIDENTS.find((r) => r.id === selected);
  const phonePerson = RESIDENTS.find((r) => r.id === phone);
  const silent = RESIDENTS.filter((r) => (resolved[r.id] ?? r.checkInStatus) === "silent");
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
  function later(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }
  function addLog(id: string, text: string, time = "5:02pm") {
    setLogs((x) => ({ ...x, [id]: [...(x[id] ?? []), { time, text }] }));
  }
  function update(id: string, status: ResponseStatus) {
    setResolved((x) => ({ ...x, [id]: status }));
  }
  function openPerson(id: string) {
    setSelected(id);
    setDrawer(true);
  }
  function act(r: Resident) {
    setSelected(r.id);
    setDrawer(false);
    const group = groupFor(r);
    if (group === "check") {
      setPhone(r.id);
      setPhoneMode("neighbor");
      setWalking(r.id);
      setPending((x) => ({ ...x, [r.id]: `Waiting for ${r.neighbor.name.split(" ")[0]}` }));
      setReplies((x) => {
        const next = { ...x };
        delete next[r.id];
        return next;
      });
      addLog(r.id, `Neighbor ${r.neighbor.name.split(" ")[0]} asked to knock`);
    } else if (group === "call") {
      setPhone(r.id);
      setPhoneMode("contact");
      setPending((x) => ({ ...x, [r.id]: `Calling ${r.emergencyContact.name}…` }));
      addLog(r.id, `Called ${r.emergencyContact.relation} ${r.emergencyContact.name}`);
      later(1800, () => {
        setReplies((x) => ({ ...x, [r.id]: "He's here with me. His phone died, but he's safe." }));
        update(r.id, "safe");
        setPending((x) => {
          const n = { ...x };
          delete n[r.id];
          return n;
        });
        addLog(r.id, `${r.emergencyContact.name} confirmed safe`, "5:15pm");
      });
    } else {
      update(r.id, "helpOnWay");
      addLog(r.id, "Welfare check dispatched · Crew 4 en route");
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
    setPending((x) => {
      const n = { ...x };
      delete n[id];
      return n;
    });
    addLog(id, `${r.neighbor.name.split(" ")[0]}: ${message}`, "5:15pm");
    if (value !== "none") update(id, value === "okay" ? "safe" : "needsHelp");
  }
  function stopDemo() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDemo(false);
    setDemoPhase(0);
  }
  function runDemo() {
    stopDemo();
    setDemo(true);
    setDemoPhase(1);
    setDistrict(null);
    setResolved({});
    setReplies({});
    setLogs({});
    setPending({});
    setSelected(null);
    setDrawer(false);
    setPhone(null);
    setWalking(null);
    later(2400, () => {
      setDistrict("elm");
      setDemoPhase(2);
    });
    later(4200, () => {
      setSelected("412");
      setDemoPhase(3);
    });
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
      // The city-wide response team confirms the other six high-priority homes in parallel.
      setResolved((x) => ({
        ...x,
        "438": "safe",
        "440": "safe",
        "442": "safe",
        "444": "safe",
        "446": "safe",
        "448": "safe",
      }));
      setPhone(null);
      setWalking(null);
      setSelected(null);
      setDistrict(null);
      setDemoPhase(6);
      ["438", "440", "442", "444", "446", "448"].forEach((id) =>
        addLog(id, "Responder team confirmed safe", "5:16pm"),
      );
    });
    later(14000, () => {
      setDemo(false);
      setDemoPhase(0);
    });
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const actionLabel = (r: Resident) =>
    groupFor(r) === "check"
      ? "Send neighbor to knock"
      : groupFor(r) === "call"
        ? `Call ${r.emergencyContact.relation} (${r.emergencyContact.name})`
        : "Dispatch welfare check";
  return (
    <div className="dashboard-shell">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <House className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">
              Doorstep<span className="text-primary">.</span>
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Catastrophe response
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
          <span className="flex gap-1 text-brand">
            <span className="size-2 rounded-full bg-brand" />
            <span className="size-2 rounded-full bg-brand" />
            <span className="size-2 rounded-full bg-brand" />
          </span>
          <span className="font-semibold text-foreground">State Farm</span>
          <span className="mx-3 text-border">/</span> Richardson operations
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-safe" /> Live response
          </span>
          <Button
            onClick={demo ? stopDemo : runDemo}
            variant="outline"
            className="h-10 border-primary/40 text-primary"
          >
            {demo ? <Square /> : <Play />} {demo ? "Stop demo" : "Run demo"}
          </Button>
          <span className="hidden size-9 items-center justify-center rounded-full border border-border text-xs md:flex">
            MS
          </span>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <CloudLightning className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              Storm hit Richardson, TX{" "}
              <span className="font-normal text-muted-foreground">· 3 hours ago</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Saturday, November 7 · Severe thunderstorm response
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4" aria-live="polite">
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums">
              {accountedFor(resolved).toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">of 12,000</span>
            </p>
            <p className="text-xs text-muted-foreground">accounted for</p>
          </div>
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden text-right sm:block">
            <p className="text-xl font-semibold text-danger">
              {38 - (accountedFor(resolved) - 11962)}
            </p>
            <p className="text-xs text-muted-foreground">still unconfirmed</p>
          </div>
        </div>
      </div>
      <main className="dashboard-workspace">
        <section className="map-area" aria-label="Richardson response map">
          <ClientOnly
            fallback={
              <div className="grid h-full place-items-center text-muted-foreground">
                Loading Richardson map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-muted-foreground">
                  Loading Richardson map…
                </div>
              }
            >
              <ResponseMap
                district={district}
                resolved={resolved}
                selected={selected}
                walking={walking}
                onDistrict={setDistrict}
                onSelect={openPerson}
              />
            </Suspense>
          </ClientOnly>
          {district === "elm" && streetView && (
            <StreetView resolved={resolved} selected={selected} onSelect={openPerson} />
          )}
          {district === "elm" && (
            <Button
              variant="secondary"
              className="map-float right-5 top-20"
              onClick={() => setStreetView((v) => !v)}
            >
              {streetView ? "Show map" : "Show street view"}
            </Button>
          )}
          <div className="map-float left-5 top-5 flex items-center gap-3 rounded-lg px-4 py-3">
            <MapPin className="size-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">{activeDistrict?.name ?? "Richardson, Texas"}</p>
              <p className="text-[11px] text-muted-foreground">
                {district === "elm"
                  ? "30 households · Elm Street"
                  : district
                    ? `${activeDistrict?.totalResidents.toLocaleString()} residents`
                    : "9 neighborhoods · Dallas County"}
              </p>
            </div>
            {district && (
              <Button
                variant="ghost"
                size="icon"
                title="Back to city"
                aria-label="Back to city"
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
              {district === "elm" ? "Household status" : "Silent at home"}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
              {district === "elm" ? (
                <>
                  <LegendDot tone="bg-light" text="Safe" />
                  <LegendDot tone="bg-alert" text="Needs help" />
                  <LegendDot tone="border-2 border-danger bg-night" text="Home + silent" />
                  <LegendDot tone="border border-unknown" text="Away ↗" />
                  <LegendDot tone="bg-unknown" text="Unknown ?" />
                </>
              ) : (
                <>
                  <LegendDot tone="border border-unknown bg-unknown/10" text="0" />
                  <LegendDot tone="border border-light bg-light/40" text="1–3" />
                  <LegendDot tone="border border-alert bg-alert/40" text="4–8" />
                  <LegendDot tone="border border-danger bg-danger/40" text="9+ · urgent" />
                </>
              )}
            </div>
          </div>
          {demo && (
            <div className="map-float bottom-32 left-5 rounded-lg px-4 py-3 text-xs text-primary">
              <Radio className="mr-2 inline size-4" />
              {
                [
                  "",
                  "Finding the highest-priority homes",
                  "Elm District · 9 silent at home",
                  "Mrs. Lopez said she'd stay home",
                  "Maria is checking on Mrs. Lopez",
                  "Maria confirmed: she's okay",
                  "Team confirmations received · Elm priority reduced",
                ][demoPhase]
              }
            </div>
          )}
          <span className="map-float right-5 top-5 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-muted-foreground">
            <Layers className="size-3.5" />
            {district ? "Neighborhood view" : "City view"}
          </span>
        </section>
        <aside
          className="response-panel"
          aria-label={district ? "Where to look" : "City priorities"}
        >
          {!district ? (
            <>
              <section className="border-b border-border p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">From city to doorstep</h2>
                  <Crosshair className="size-4 text-primary" />
                </div>
                <div className="space-y-4">
                  {[
                    {
                      label: "Residents in the storm's path",
                      value: 12000,
                      width: "100%",
                      color: "bg-unknown",
                      text: "text-foreground",
                    },
                    {
                      label: "Replied safe",
                      value: 11640,
                      width: "97%",
                      color: "bg-safe",
                      text: "text-foreground",
                    },
                    {
                      label: "Silent after check-in",
                      value: 360 - resolvedHome,
                      width: "53%",
                      color: "bg-primary",
                      text: "text-primary",
                    },
                    {
                      label: "Said they'd be home",
                      value: 41 - resolvedHome,
                      width: "30%",
                      color: "bg-alert",
                      text: "text-alert",
                    },
                    {
                      label: "Home + vulnerable",
                      value: Math.max(0, 9 - resolvedHome),
                      width: "12%",
                      color: "bg-danger",
                      text: "text-danger",
                    },
                  ].map((f, i) => (
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
                        animate={{ width: f.width }}
                        transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.15 }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-5 flex items-center gap-2 text-xs text-danger">
                  <Footprints className="size-4" />
                  {Math.max(0, 9 - resolvedHome)} people need a knock first
                </p>
              </section>
              <section className="p-6">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-base font-semibold">Send responders here first</h2>
                  <ArrowDown className="size-4 text-muted-foreground" />
                </div>
                <p className="mb-5 text-xs text-muted-foreground">
                  Ranked by people silent at home
                </p>
                <div className="space-y-1">
                  {ranked.map((d, i) => (
                    <Button
                      key={d.id}
                      variant="ghost"
                      onClick={() => setDistrict(d.id)}
                      className="h-auto min-h-14 w-full justify-start gap-3 rounded-md px-2 py-3"
                    >
                      <span className="w-4 text-xs text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          urgency(districtCount(d, resolved)) === "red"
                            ? "bg-danger"
                            : urgency(districtCount(d, resolved)) === "orange"
                              ? "bg-alert"
                              : districtCount(d, resolved)
                                ? "bg-primary"
                                : "bg-unknown",
                        )}
                      />
                      <span className="flex-1 text-left text-sm">{d.name}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {districtCount(d, resolved)}
                      </span>
                      <ChevronRight className="text-muted-foreground" />
                    </Button>
                  ))}
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
                  <ArrowLeft /> Back to city
                </Button>
                <h2 className="text-xl font-semibold">Where to look</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeDistrict?.name} ·{" "}
                  {district === "elm" ? silent.length : activeDistrict?.silentAtHome} unconfirmed
                </p>
              </section>
              {district === "elm" ? (
                <div className="space-y-6 p-5">
                  {groups.map((g) => {
                    const people = silent.filter((r) => groupFor(r) === g.key);
                    if (!people.length) return null;
                    return (
                      <section key={g.key}>
                        <h3
                          className={cn(
                            "mb-3 flex items-center justify-between text-sm font-semibold",
                            g.tone,
                          )}
                        >
                          {g.title}
                          <span className="text-xs">{people.length}</span>
                        </h3>
                        <div className="space-y-3">
                          <AnimatePresence>
                            {people.map((r) => (
                              <motion.article
                                layout={!reduce}
                                exit={{ opacity: 0, height: 0 }}
                                key={r.id}
                                className={cn(
                                  "overflow-hidden rounded-lg border bg-card p-4",
                                  g.border,
                                )}
                              >
                                <Button
                                  variant="ghost"
                                  onClick={() => openPerson(r.id)}
                                  className="h-auto w-full justify-start whitespace-normal p-0 text-left hover:bg-transparent"
                                >
                                  <span className="flex-1">
                                    <span className="block text-base font-semibold">
                                      {r.shortName}{" "}
                                      <span className="text-xs font-normal text-muted-foreground">
                                        · {r.age}
                                      </span>
                                    </span>
                                    <span className="mt-1 block text-[11px] text-muted-foreground">
                                      {r.address}
                                    </span>
                                    <span className="mt-2 flex flex-wrap gap-1">
                                      {reasons(r).map((c) => (
                                        <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                                          {c}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                  <span className="grid h-8 min-w-8 place-items-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground" title="Urgency score">
                                    Urgency {score(r)}
                                  </span>
                                </Button>
                                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                                  {r.planAnswer === "home"
                                    ? r.id === "412"
                                      ? "Said she'd stay home"
                                      : "Said they'd stay home"
                                    : planLabel(r)}
                                  {r.livesAlone ? " · lives alone" : ""} · silent {r.silentHours}h
                                </p>
                                <blockquote className="mt-2 border-l-2 border-primary/60 pl-2 text-xs italic text-foreground/90">
                                  “{r.planQuote}”
                                </blockquote>
                                <Ladder step={pending[r.id] ? 4 : r.silentHours >= 3 ? 2 : 1} />
                                <Button
                                  id={`act-${r.id}`}
                                  onClick={() => act(r)}
                                  disabled={Boolean(pending[r.id])}
                                  variant={g.key === "check" ? "destructive" : "secondary"}
                                  className="mt-3 h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs"
                                >
                                  {g.key === "check" ? (
                                    <Footprints />
                                  ) : g.key === "call" ? (
                                    <PhoneIcon />
                                  ) : (
                                    <ShieldCheck />
                                  )}
                                  {pending[r.id] ?? actionLabel(r)}
                                </Button>
                              </motion.article>
                            ))}
                          </AnimatePresence>
                        </div>
                      </section>
                    );
                  })}
                  <section className="border-t border-border pt-4">
                    <h3 className="text-sm font-semibold text-alert">Help requested</h3>
                    {RESIDENTS.filter((r) =>
                      ["needsHelp", "helpOnWay"].includes(resolved[r.id] ?? r.checkInStatus),
                    ).map((r) => (
                      <Button
                        key={r.id}
                        onClick={() => openPerson(r.id)}
                        variant="ghost"
                        className="mt-2 h-auto w-full justify-between text-xs"
                      >
                        <span>
                          {r.shortName} · {r.address}
                        </span>
                        <ArrowRight />
                      </Button>
                    ))}
                  </section>
                </div>
              ) : (
                <section className="p-6">
                  <p className="text-sm text-muted-foreground">
                    {activeDistrict?.silentAtHome} residents silent at home
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
          <footer className="flex items-center gap-2 border-t border-border px-6 py-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Simulated response · mock data
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
                Saturday · 5:02 PM
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
                  {replies[phonePerson.id] === "No answer" && (
                    <Button
                      variant="destructive"
                      className="mt-3 w-full"
                      onClick={() => {
                        update(phonePerson.id, "helpOnWay");
                        addLog(
                          phonePerson.id,
                          "No answer at door · responder dispatched",
                          "5:16pm",
                        );
                        setPhone(null);
                      }}
                    >
                      Dispatch welfare check
                    </Button>
                  )}
                </>
              ) : phoneMode === "neighbor" ? (
                <div className="mt-5 space-y-2">
                  <Button
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {person && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl">{person.name}</SheetTitle>
                <SheetDescription>
                  {person.address} · {person.age} years old
                </SheetDescription>
              </SheetHeader>
              <div className="my-6 border-y border-primary/30 py-4">
                <p className="text-xs uppercase tracking-widest text-primary">Pre-storm plan</p>
                <h3 className="mt-2 text-xl font-semibold">
                  Plan: {planLabel(person).toLowerCase()}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">“{person.planQuote}”</p>
                <p className="mt-3 text-xs text-primary">
                  Now:{" "}
                  {resolved[person.id] === "helpOnWay"
                    ? "Help on the way"
                    : (resolved[person.id] ?? person.checkInStatus) === "safe"
                      ? "Confirmed safe"
                      : (resolved[person.id] ?? person.checkInStatus) === "needsHelp"
                        ? "Needs help"
                        : "No check-in received"}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-5 text-sm">
                {[
                  ["Language", person.language],
                  ["Lives alone", person.livesAlone ? "Yes" : "No"],
                  ["Medical needs", person.medicalNeed ?? "None listed"],
                  [
                    "Emergency contact",
                    `${person.emergencyContact.name} · ${person.emergencyContact.relation}`,
                  ],
                  ["Opted-in neighbor", `${person.neighbor.name} · ${person.neighbor.address}`],
                ].map(([k, v]) => (
                  <div key={k} className={k === "Opted-in neighbor" ? "col-span-2" : ""}>
                    <dt className="mb-1 text-xs text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mb-4 mt-8 text-base font-semibold">Response timeline</h3>
              <ol className="space-y-5 border-l border-border pl-5">
                {[
                  {
                    time: "Fri 6:10pm",
                    text: `Asked plan → ${person.planAnswer ? (person.planAnswer === "home" ? "'Home'" : person.planDetail) : "No reply"}`,
                  },
                  { time: "Sat 4:02pm", text: `Check-in sent (${person.language})` },
                  {
                    time: "4:32pm",
                    text:
                      person.checkInStatus === "silent"
                        ? "No reply → text resent"
                        : `Replied: ${person.checkInStatus === "safe" ? "Safe" : "Need help"}`,
                  },
                  ...(logs[person.id] ?? []),
                ].map((l, i) => (
                  <li key={i}>
                    <p className="text-[11px] text-primary">{l.time}</p>
                    <p className="mt-1 text-sm">{l.text}</p>
                  </li>
                ))}
              </ol>
              {(resolved[person.id] ?? person.checkInStatus) === "silent" && (
                <Button className="mt-7 h-12 w-full whitespace-normal" onClick={() => act(person)}>
                  <Footprints />
                  {actionLabel(person)}
                </Button>
              )}
            </>
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

const STEPS = ["Text", "Call", "Family", "Neighbor", "Responders"];
function reasons(r: Resident) {
  const c: string[] = [];
  if (r.livesAlone) c.push("Home alone");
  if (r.age >= 65) c.push(`Age ${r.age}`);
  if (r.silentHours > 0) c.push(`Silent ${r.silentHours}h`);
  if (r.language !== "English") c.push(r.language);
  return c;
}
function score(r: Resident) {
  return (r.livesAlone ? 3 : 0) + (r.age >= 70 ? 3 : 0) + (r.language !== "English" ? 2 : 0) + Math.min(r.silentHours, 4);
}
function Ladder({ step }: { step: number }) {
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label={`Escalation step ${step} of 5`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="min-w-0">
            <span
              className={cn(
                "block h-1.5 rounded-full transition-colors duration-500",
                n < step ? "bg-primary/50" : n === step ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "mt-1.5 block text-[10px] leading-tight",
                n === step ? "font-bold text-primary" : "text-muted-foreground",
              )}
            >
              {n}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
