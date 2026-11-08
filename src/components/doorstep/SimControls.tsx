import { FastForward, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock, wallClock, type SimAction, type SimState } from "@/lib/doorstep/simulation";

interface Props {
  sim: SimState;
  dispatch: (a: SimAction) => void;
  disabled?: boolean;
}

const SPEEDS = [
  { s: 30, label: "1 hr = 30s" },
  { s: 10, label: "1 hr = 10s" },
  { s: 4, label: "1 hr = 4s" },
];

/** Simulation clock: start / pause / advance / reset, fast-forward speed and escalation wait. */
export function SimControls({ sim, dispatch, disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Simulation controls">
      <span
        className="rounded-md border border-border px-2 py-1 font-mono tabular-nums"
        aria-live="off"
        title={wallClock(sim.now)}
      >
        {formatClock(sim.now)}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => dispatch({ type: "set_running", running: !sim.running })}
        aria-label={sim.running ? "Pause simulation" : "Start simulation"}
      >
        {sim.running ? <Pause /> : <Play />} {sim.running ? "Pause" : "Start"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => dispatch({ type: "advance_to_next" })}
        title="Advance to the next scripted or escalation event"
      >
        <SkipForward /> Advance
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => dispatch({ type: "reset" })}
        title="Reset to before the incident"
      >
        <RotateCcw /> Reset
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => dispatch({ type: "reset", to: 185 })}
        title="Jump to T+3h05m"
      >
        <FastForward /> T+3h
      </Button>
      <label className="flex items-center gap-1 text-muted-foreground">
        Speed
        <select
          className="rounded-md border border-border bg-card px-1.5 py-1 text-foreground"
          value={sim.secondsPerSimHour}
          onChange={(e) =>
            dispatch({ type: "set_speed", secondsPerSimHour: Number(e.target.value) })
          }
        >
          {SPEEDS.map((x) => (
            <option key={x.s} value={x.s}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex items-center gap-1 text-muted-foreground"
        title="Simulated minutes to wait before each escalation step"
      >
        Wait
        <select
          className="rounded-md border border-border bg-card px-1.5 py-1 text-foreground"
          value={sim.config.waitMinutes[0]}
          onChange={(e) => dispatch({ type: "set_wait", minutes: Number(e.target.value) })}
        >
          {[30, 60, 120].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
