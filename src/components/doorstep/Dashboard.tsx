import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RESIDENTS, STAGES, groupFor, planLabel, type Group, type Resident } from "@/lib/doorstep-data";
import { cn } from "@/lib/utils";
import { House, type Porch } from "./House";
import { Phone, type PhoneView } from "./Phone";

type Status = "safe" | "needsHelp" | "silent" | "helpOnWay";
type Log = { time: string; text: string };

const byId = Object.fromEntries(RESIDENTS.map((r) => [r.id, r]));
const STAGE_TIME = ["Fri 6:10pm", "Sat 2:00pm", "Sat 4:02pm", "Sat 8:02pm"];

function baseLog(r: Resident, stage: number): Log[] {
  const l: Log[] = [];
  if (r.planAnswer) l.push({ time: "Fri 6:10pm", text: `Asked plan → replied '${r.planAnswer === "home" ? "Home" : r.planDetail}'` });
  else l.push({ time: "Fri 6:10pm", text: "Asked plan → no reply" }, { time: "Sat 9:00am", text: "Plan question resent → no reply" });
  if (stage >= 1) l.push({ time: "Sat 2:00pm", text: "Storm reaches Elm St · power out" });
  if (stage >= 2) {
    l.push({ time: "Sat 4:02pm", text: `Check-in sent (${r.language})` });
    if (r.checkInStatus === "safe") l.push({ time: "4:09pm", text: "Replied 'Safe'" });
    if (r.checkInStatus === "needsHelp") l.push({ time: "4:11pm", text: "Replied 'Need help' → crew notified" });
    if (r.checkInStatus === "silent") l.push({ time: "4:32pm", text: "No reply → text resent" });
  }
  if (stage >= 3 && r.checkInStatus === "silent") l.push({ time: "8:00pm", text: "Still silent after 6 hours" });
  return l;
}

const GROUPS: { key: Group; title: string; hint: string; tone: string; dot: string }[] = [
  { key: "check", title: "Check the house now", hint: "Said they'd stay home · no reply", tone: "border-danger", dot: "bg-danger" },
  { key: "call", title: "Call their contact", hint: "Said they'd be away · no reply", tone: "border-alert", dot: "bg-alert" },
  { key: "unknown", title: "Unknown", hint: "Never answered the plan text", tone: "border-unknown", dot: "bg-unknown" },
];

export function Dashboard() {
  const [stage, setStage] = useState(2);
  const [planShown, setPlanShown] = useState(true);
  const [resolved, setResolved] = useState<Record<string, Status>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, Log[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [phone, setPhone] = useState<PhoneView>(null);
  const [neighborReply, setNeighborReply] = useState<Record<string, string>>({});
  const [highlight, setHighlight] = useState<"okay" | null>(null);
  const [demo, setDemo] = useState(false);
  const timers = useRef<number[]>([]);
  const clock = useRef(0);

  const statusOf = useCallback(
    (r: Resident): Status | null => (stage < 2 ? null : resolved[r.id] ?? r.checkInStatus),
    [stage, resolved],
  );

  const addLog = (id: string, text: string) => {
    clock.current += 7;
    const base = stage >= 3 ? 20 * 60 + 5 : 16 * 60 + 40;
    const m = base + clock.current;
    const time = `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")}pm`;
    setExtra((e) => ({ ...e, [id]: [...(e[id] ?? []), { time, text }] }));
  };

  const resolve = (id: string, s: Status) => setResolved((x) => ({ ...x, [id]: s }));

  const knock = (r: Resident) => {
    setSelected(r.id);
    setPhone({ mode: "neighbor", id: r.id });
    setPending((p) => ({ ...p, [r.id]: `Waiting on ${r.neighbor.name.split(" ")[0]}…` }));
    addLog(r.id, `Neighbor ${r.neighbor.name.split(" ")[0]} asked to knock`);
  };
  const neighborAnswer = (r: Resident, a: "okay" | "help" | "none") => {
    const first = r.neighbor.name.split(" ")[0];
    const msg = a === "okay" ? `${r.name.startsWith("Elena") ? "She's" : "They're"} okay` : a === "help" ? "Needs help" : "No answer";
    setNeighborReply((n) => ({ ...n, [r.id]: msg }));
    addLog(r.id, `${first}: ${msg}`);
    setPending(({ [r.id]: _, ...rest }) => rest);
    setHighlight(null);
    if (a === "okay") resolve(r.id, "safe");
    if (a === "help") resolve(r.id, "needsHelp");
  };
  const call = (r: Resident) => {
    setSelected(r.id);
    setPending((p) => ({ ...p, [r.id]: `Calling ${r.emergencyContact.name}…` }));
    addLog(r.id, `Called ${r.emergencyContact.relation} ${r.emergencyContact.name}`);
    timers.current.push(
      window.setTimeout(() => {
        setPending(({ [r.id]: _, ...rest }) => rest);
        addLog(r.id, `${r.emergencyContact.name}: "He's here with me, phone died."`);
        resolve(r.id, "safe");
      }, 1600),
    );
  };
  const welfare = (r: Resident) => {
    setSelected(r.id);
    addLog(r.id, "Welfare check dispatched · crew 4 en route");
    resolve(r.id, "helpOnWay");
  };
  const act = (r: Resident) => {
    const g = groupFor(r);
    if (g === "check") knock(r);
    else if (g === "call") call(r);
    else welfare(r);
  };
  const actLabel = (r: Resident) => {
    const g = groupFor(r);
    if (g === "check") return "Send neighbor to knock";
    if (g === "call") return `Call ${r.emergencyContact.relation} (${r.emergencyContact.name})`;
    return "Dispatch welfare check";
  };

  const open = (id: string) => {
    setSelected(id);
    setDrawer(true);
    if (phone?.id !== id) setPhone({ mode: "resident", id });
  };

  const silent = RESIDENTS.filter((r) => statusOf(r) === "silent");
  const accounted = RESIDENTS.length - silent.length;
  const plansIn = RESIDENTS.filter((r) => r.planAnswer !== null).length;
  const allDone = stage >= 2 && accounted === RESIDENTS.length;

  // Demo
  const stopDemo = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDemo(false);
  };
  const runDemo = () => {
    stopDemo();
    setDemo(true);
    setResolved({}); setPending({}); setExtra({}); setNeighborReply({}); setDrawer(false);
    clock.current = 0;
    setStage(0); setPlanShown(false); setPhone(null); setSelected(null);
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(300, () => setPlanShown(true));
    at(1800, () => { setSelected("427"); setPhone({ mode: "resident", id: "427" }); });
    at(3400, () => { setSelected("412"); setPhone({ mode: "resident", id: "412" }); });
    at(5000, () => setStage(1));
    at(7000, () => { setStage(2); setSelected(null); });
    at(10000, () => setStage(3));
  };
  // Demo actions need fresh closures, so trigger by stage + flag
  const demoStep = useRef(0);
  useEffect(() => {
    if (!demo) { demoStep.current = 0; return; }
    if (stage === 3 && demoStep.current === 0) {
      demoStep.current = 1;
      const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
      at(1200, () => document.getElementById("act-412")?.click());
      at(2600, () => setHighlight("okay"));
      at(3600, () => document.querySelector<HTMLButtonElement>("[data-okay]")?.click());
      at(5200, () => document.getElementById("act-427")?.click());
      at(8000, () => document.getElementById("act-433")?.click());
      at(9000, () => setDemo(false));
    }
  }, [stage, demo]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const sel = selected ? byId[selected] : null;
  const phoneRes = phone ? byId[phone.id] : null;

  const tagFor = (r: Resident) => {
    const s = statusOf(r);
    if (s === "helpOnWay") return "Help on the way";
    if (s === "needsHelp") return "Needs help";
    if (pending[r.id]) return pending[r.id];
    if (!planShown) return null;
    if (r.planAnswer === "family" || r.planAnswer === "shelter") return r.planDetail;
    if (r.planAnswer === null) return "No plan reply";
    return null;
  };

  const north = RESIDENTS.filter((r) => r.row === "north");
  const south = RESIDENTS.filter((r) => r.row === "south");
  const renderRow = (rows: Resident[], offset: number) =>
    rows.map((r, i) => {
      const s = statusOf(r);
      const porch: Porch = s === "safe" ? "safe" : s === "needsHelp" || s === "helpOnWay" ? "help" : "off";
      return (
        <House key={r.id} resident={r} planShown={planShown} porch={porch}
          urgent={s === "silent" && r.planAnswer === "home"}
          delay={stage >= 2 ? (i + offset) * 140 : (i + offset) * 90}
          tag={tagFor(r)} selected={selected === r.id} onClick={() => open(r.id)} />
      );
    });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Doorstep</p>
          <h1 className="text-4xl font-bold">Doorstep knows where to look.</h1>
          <p className="mt-1 text-muted-foreground">Elm St · 20 homes · each told us where they'd ride out the storm.</p>
        </div>
      </header>

      {/* Timeline */}
      <section className="mb-6 rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[320px] flex-1">
            <input type="range" min={0} max={3} step={1} value={stage}
              aria-label="Storm timeline" aria-valuetext={STAGES[stage]}
              onChange={(e) => { stopDemo(); setPlanShown(true); setStage(Number(e.target.value)); }}
              className="stage-range" style={{ ["--fill" as string]: `${(stage / 3) * 100}%` }} />
            <div className="mt-3 grid grid-cols-4 text-sm">
              {STAGES.map((s, i) => (
                <button key={s} onClick={() => { stopDemo(); setPlanShown(true); setStage(i); }}
                  className={cn("min-h-10 rounded-lg px-1 font-semibold transition-colors", i === 0 ? "text-left" : i === 3 ? "text-right" : "text-center", i === stage ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div aria-live="polite" className={cn("rounded-2xl bg-muted px-5 py-3 text-center transition-all", allDone && "glow-amber")}>
            <p className="font-display text-3xl font-bold">
              {stage >= 2 ? accounted : planShown ? plansIn : 0} <span className="text-lg text-muted-foreground">of 20</span>
            </p>
            <p className="text-sm text-muted-foreground">{stage >= 2 ? "accounted for" : "plans received"}</p>
          </div>
          <button onClick={demo ? stopDemo : runDemo}
            className="min-h-14 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground transition hover:brightness-110 glow-amber">
            {demo ? "Stop demo" : "▶ Run demo"}
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Street */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card/60 p-5 shadow-card">
          {stage === 1 && <div className="rain pointer-events-none absolute inset-0 z-10" />}
          {allDone && (
            <div className="pointer-events-none absolute inset-0 z-10">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="firefly" style={{ left: `${(i * 37) % 100}%`, bottom: `${(i * 13) % 40}%`, animationDelay: `${(i % 7) * 0.4}s` }} />
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">Elm Street</h2>
            <Legend />
          </div>
          {allDone && (
            <div className="rise mb-3 rounded-2xl bg-primary/15 px-4 py-3 text-center font-semibold text-primary">
              Everyone on Elm St is accounted for.
            </div>
          )}
          <div key={stage === 1 ? "storm" : "calm"} className={cn(stage === 1 && "storm")}>
            <div className="grid grid-cols-5 gap-1 md:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">{renderRow(north, 0)}</div>
            <div className="my-4 flex items-center gap-3">
              <div className="h-12 flex-1 rounded-xl bg-night/80 bg-[repeating-linear-gradient(90deg,transparent_0_28px,var(--color-primary)_28px_52px)] bg-[length:100%_3px] bg-center bg-no-repeat" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Elm St</span>
            </div>
            <div className="grid grid-cols-5 gap-1 md:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">{renderRow(south, 10)}</div>
          </div>
        </section>

        {/* Where to look + phone */}
        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-2xl font-bold">Where to look</h2>
            {stage < 2 ? (
              <p className="mt-2 text-muted-foreground">Check-ins go out 2 hours after the storm. Silent neighbors will show up here, sorted by where they said they'd be.</p>
            ) : silent.length === 0 ? (
              <p className="mt-2 text-primary">Nobody left to find. Nice work.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-5">
                {GROUPS.map((g) => {
                  const list = silent.filter((r) => groupFor(r) === g.key);
                  if (!list.length) return null;
                  return (
                    <div key={g.key}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={cn("h-3 w-3 rounded-full", g.dot)} />
                        <h3 className="text-lg font-bold">{g.title}</h3>
                        <span className="ml-auto text-xs text-muted-foreground">{g.hint}</span>
                      </div>
                      {list.map((r) => (
                        <div key={r.id} className={cn("rise mb-2 rounded-2xl border-l-4 bg-muted p-4", g.tone)}>
                          <button onClick={() => open(r.id)} className="w-full text-left">
                            <p className="text-lg font-semibold">{r.name} <span className="font-normal text-muted-foreground">· {r.age}</span></p>
                            <p className="text-sm text-muted-foreground">{reason(r, stage)}</p>
                          </button>
                          <button id={`act-${r.id}`} disabled={!!pending[r.id]} onClick={() => act(r)}
                            className={cn("mt-3 min-h-12 w-full rounded-xl font-bold transition hover:brightness-110 disabled:opacity-70",
                              g.key === "check" ? "bg-danger text-destructive-foreground" : g.key === "call" ? "bg-alert text-primary-foreground" : "bg-unknown text-primary-foreground")}>
                            {pending[r.id] ?? actLabel(r)}
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-lg font-bold">On their phone</h2>
              {phoneRes && phone?.mode === "neighbor" && (
                <button className="text-sm text-primary underline" onClick={() => setPhone({ mode: "resident", id: phoneRes.id })}>View resident</button>
              )}
            </div>
            <PhoneWithOkay>
              <Phone view={phone} resident={phoneRes} stage={stage} status={phoneRes ? statusOf(phoneRes) : null}
                neighborReply={phoneRes ? neighborReply[phoneRes.id] ?? null : null}
                onNeighbor={(a) => phoneRes && neighborAnswer(phoneRes, a)} highlight={highlight} />
            </PhoneWithOkay>
          </section>
        </aside>
      </div>

      {drawer && sel && (
        <Drawer r={sel} stage={stage} status={statusOf(sel)} logs={[...baseLog(sel, stage), ...(extra[sel.id] ?? [])]} onClose={() => setDrawer(false)} />
      )}
    </div>
  );
}

// Marks the first phone button as the "okay" one for the demo.
function PhoneWithOkay({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = ref.current?.querySelector(".mt-auto button");
    if (b) b.setAttribute("data-okay", "");
  });
  return <div ref={ref}>{children}</div>;
}

function reason(r: Resident, stage: number) {
  const parts = [r.planAnswer === "home" ? "Said they'd stay home" : r.planAnswer ? planLabel(r) : "No plan reply"];
  if (r.name.startsWith("Elena")) parts[0] = "Said she'd stay home";
  if (r.livesAlone) parts.push("lives alone");
  parts.push(`silent ${stage >= 3 ? r.silentHours + 4 : r.silentHours}h`);
  return parts.join(" · ");
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded-full", cls)} />{label}</span>
  );
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {item("bg-primary", "Checked in")}
      {item("bg-alert", "Needs help")}
      {item("bg-muted border border-border", "Silent")}
      {item("bg-danger", "Home + silent")}
    </div>
  );
}

function Drawer({ r, stage, status, logs, onClose }: { r: Resident; stage: number; status: Status | null; logs: Log[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const statusText = status === null ? "Check-in not sent yet" : status === "safe" ? "Safe" : status === "needsHelp" ? "Needs help" : status === "helpOnWay" ? "Help on the way" : "Silent";
  const fact = (k: string, v: string) => (
    <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-night/60" onClick={onClose}>
      <aside role="dialog" aria-label={r.name} onClick={(e) => e.stopPropagation()}
        className="rise h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold">{r.name}</h2>
            <p className="text-muted-foreground">{r.address} · {r.age}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-xl hover:bg-accent">×</button>
        </div>
        <div className="mt-5 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="font-display text-2xl font-bold text-primary">{r.planAnswer === "home" ? "Staying home" : r.planAnswer ? planLabel(r) : "Never answered"}</p>
          <p className="mt-1 text-sm">Now: <span className="font-semibold">{statusText}</span>{stage < 2 ? "" : ""}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {fact("Language", r.language)}
          {fact("Lives alone", r.livesAlone ? "Yes" : "No")}
          {fact("Medical needs", r.medicalNeed ?? "None listed")}
          {fact("Emergency contact", `${r.emergencyContact.name} (${r.emergencyContact.relation})`)}
          <div className="col-span-2">{fact("Nearest opted-in neighbor", `${r.neighbor.name} · ${r.neighbor.address}`)}</div>
        </div>
        <h3 className="mt-6 mb-3 text-lg font-bold">Timeline</h3>
        <ol className="flex flex-col gap-2">
          {logs.map((l, i) => (
            <li key={i} className="rise flex gap-3 rounded-xl bg-muted p-3 text-sm">
              <span className="w-20 shrink-0 font-semibold text-primary">{l.time}</span><span>{l.text}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
