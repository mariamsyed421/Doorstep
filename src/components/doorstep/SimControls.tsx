import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SimAction, SimState } from "@/lib/doorstep/simulation";

interface Props {
  sim: SimState;
  dispatch: (a: SimAction) => void;
  onReset: () => void;
}

/** Simulation clock: start / pause and reset. */
export function SimControls({ sim, dispatch, onReset }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Simulation controls">
      <Button
        size="sm"
        variant="outline"
        onClick={() => dispatch({ type: "set_running", running: !sim.running })}
        aria-label={sim.running ? "Pause simulation" : "Start simulation"}
      >
        {sim.running ? <Pause /> : <Play />} {sim.running ? "Pause" : "Start"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onReset} title="Reset to before the incident">
        <RotateCcw /> Reset
      </Button>
    </div>
  );
}
