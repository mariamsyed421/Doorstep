import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Footprints,
  Phone as PhoneIcon,
  Search,
  ShieldCheck,
  ClipboardList,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Resident } from "@/lib/doorstep-data";
import { STAGES } from "@/lib/doorstep/escalation";
import type { Assessment } from "@/lib/doorstep/scoring";
import type { MarkerState, SimState } from "@/lib/doorstep/simulation";
import { cn } from "@/lib/utils";
import { FILTERS, LEVEL_STYLE, nextAction, type QueueFilter } from "./logic";

interface Props {
  people: Resident[];
  sim: SimState;
  assessments: Record<string, Assessment>;
  markers: Record<string, MarkerState>;
  filter: QueueFilter;
  search: string;
  selected: string | null;
  pending: Record<string, string>;
  resolvedCount: number;
  onFilter: (f: QueueFilter) => void;
  onSearch: (q: string) => void;
  onOpen: (id: string) => void;
  onAct: (r: Resident, stage: 3 | 4 | 5 | null) => void;
}

const BORDER: Record<MarkerState, string> = {
  danger: "border-danger/60",
  help: "border-alert/60",
  awaiting: "border-light/50",
  away: "border-primary/40",
  unknown: "border-border",
  safe: "border-safe/40",
};

export function PriorityQueue(p: Props) {
  const reduce = useReducedMotion();
  // Map → queue sync: scroll the selected card into view.
  useEffect(() => {
    if (p.selected)
      document
        .getElementById(`queue-${p.selected}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.selected]);
  return (
    <div className="space-y-4 p-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
          placeholder="Search name, address, language"
          aria-label="Search residents"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Priority filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => p.onFilter(f.key)}
            aria-pressed={p.filter === f.key}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              p.filter === f.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {!p.people.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">No residents match.</p>
      )}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {p.people.map((r, i) => {
            const a = p.assessments[r.id];
            const m = p.markers[r.id] ?? "unknown";
            const esc = p.sim.escalations[r.id];
            const reply = p.sim.signals[r.id]?.latestReply;
            const next = nextAction(r, esc, a, Boolean(p.sim.welfare[r.id]));
            if (!a) return null;
            const ladder = esc?.pendingStage ?? esc?.stage ?? -1;
            return (
              <motion.article
                layout={!reduce}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                key={r.id}
                id={`queue-${r.id}`}
                className={cn(
                  "overflow-hidden rounded-lg border bg-card p-4",
                  BORDER[m],
                  p.selected === r.id && "ring-2 ring-primary",
                )}
              >
                <Button
                  variant="ghost"
                  onClick={() => p.onOpen(r.id)}
                  className="h-auto w-full items-start justify-start whitespace-normal p-0 text-left hover:bg-transparent"
                >
                  <span className="w-5 pt-1 text-xs text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1">
                    <span className="block text-base font-semibold">
                      {r.shortName}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {r.language}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {r.address}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {a.factors
                        .filter(
                          (f) =>
                            f.points > 0 ||
                            f.id === "explicitUrgentRequest" ||
                            f.id === "assistanceRequest",
                        )
                        .slice(0, 4)
                        .map((f) => (
                          <span
                            key={f.id}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              f.id === "explicitUrgentRequest"
                                ? "bg-danger text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {f.points ? `+${f.points} ` : ""}
                            {shortLabel(f.label)}
                          </span>
                        ))}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-bold",
                        LEVEL_STYLE[a.level],
                      )}
                      title="Signal Fusion review score"
                    >
                      {a.score}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {a.level}
                    </span>
                  </span>
                </Button>
                {reply && reply.category !== "safe" ? (
                  <blockquote className="mt-2 border-l-2 border-alert/70 pl-2 text-xs italic text-foreground/90">
                    “
                    {
                      p.sim.messages
                        .filter((x) => x.residentId === r.id && x.direction === "in")
                        .at(-1)?.text
                    }
                    ”
                    <span className="mt-1 block not-italic text-[10px] text-muted-foreground">
                      AI: {reply.category.replaceAll("_", " ")} · {reply.provider}
                    </span>
                  </blockquote>
                ) : (
                  <blockquote className="mt-2 border-l-2 border-primary/60 pl-2 text-xs italic text-foreground/90">
                    “{r.planQuote}”
                  </blockquote>
                )}
                <Ladder stage={ladder} waiting={esc?.status === "awaiting_approval"} />
                {next.kind !== "none" && (
                  <Button
                    onClick={() =>
                      next.kind === "review" ? p.onOpen(r.id) : p.onAct(r, next.stage)
                    }
                    disabled={
                      Boolean(p.pending[r.id]) ||
                      (next.kind === "review" && Boolean(p.sim.welfare[r.id]))
                    }
                    variant={m === "danger" ? "destructive" : "secondary"}
                    className="mt-3 h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-xs"
                  >
                    {next.kind === "neighbor" ? (
                      <Footprints />
                    ) : next.kind === "contact" ? (
                      <PhoneIcon />
                    ) : next.kind === "welfare" ? (
                      <ShieldCheck />
                    ) : (
                      <ClipboardList />
                    )}
                    {p.pending[r.id] ?? next.label}
                    {next.needsApproval && !p.pending[r.id] && (
                      <span className="opacity-70">· approve</span>
                    )}
                  </Button>
                )}
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
      {p.filter === "all" && p.resolvedCount > 0 && (
        <Button
          variant="ghost"
          className="w-full text-xs text-muted-foreground"
          onClick={() => p.onFilter("resolved")}
        >
          <Zap /> {p.resolvedCount} confirmed safe — show
        </Button>
      )}
    </div>
  );
}

function shortLabel(l: string) {
  return l
    .replace("Planned to remain in the affected area", "Staying home")
    .replace("Mobility / accessibility assistance need", "Mobility need")
    .replace("Declared critical medical need", "Critical medical")
    .replace("Needs transportation assistance", "Needs transport")
    .replace("No confirmed response", "No response")
    .replace(/^Residence inside .*/, "In outage zone")
    .replace(/ \+ active local power outage$/, " + outage")
    .replace("Explicit urgent assistance request", "URGENT request");
}

const STEPS = ["Text", "Call", "Family", "Neighbor", "Responders"];
export function Ladder({ stage, waiting }: { stage: number; waiting?: boolean }) {
  // Stages 0 and 1 are both texts; map 0..5 onto the 5-step ladder.
  const step = stage < 0 ? 0 : Math.max(1, stage);
  return (
    <ol
      className="mt-4 grid grid-cols-5 gap-1.5"
      aria-label={`Escalation: ${stage >= 0 ? (STAGES[stage as 0]?.label ?? "") : "not started"}`}
    >
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="min-w-0">
            <span
              className={cn(
                "block h-1.5 rounded-full transition-colors duration-500",
                n < step
                  ? "bg-primary/50"
                  : n === step
                    ? waiting
                      ? "animate-pulse bg-light"
                      : "bg-primary"
                    : "bg-muted",
              )}
            />
            <span
              className={cn(
                "mt-1.5 block whitespace-nowrap text-[9.5px] leading-tight tracking-tight",
                n === step ? "font-bold text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
