import { House as HouseArt } from "./House";
import { RESIDENTS, planLabel } from "@/lib/doorstep-data";
import type { MarkerState } from "@/lib/doorstep/simulation";
import type { Assessment } from "@/lib/doorstep/scoring";
import { useEffect } from "react";

interface Props {
  markers: Record<string, MarkerState>;
  assessments: Record<string, Assessment>;
  visible: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
}

const tagFor: Record<MarkerState, string> = {
  safe: "Safe",
  help: "Needs help",
  danger: "Urgent review",
  awaiting: "Awaiting reply",
  away: "Away",
  unknown: "Unknown",
};

export function StreetView({ markers, visible, selected, onSelect }: Props) {
  const num = (a: { address: string }) => Number(a.address.split(" ")[0]);
  const byAddr = [...RESIDENTS].sort((a, b) => num(a) - num(b));
  const rows = [byAddr.filter((r) => num(r) % 2 === 0), byAddr.filter((r) => num(r) % 2 === 1)];
  // Queue → street sync: bring the selected house into view.
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector(`[data-house="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  return (
    <div className="street-scene absolute inset-0 z-[350] overflow-y-auto px-6 pb-28 pt-44">
      {rows.map((row, i) => (
        <div key={i}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
            {row.map((r, j) => {
              const s = markers[r.id] ?? "unknown";
              return (
                <div key={r.id} data-house={r.id} className={visible.has(r.id) ? "" : "opacity-25"}>
                  <HouseArt
                    resident={r}
                    planShown
                    porch={s === "safe" ? "safe" : s === "help" ? "help" : "off"}
                    state={s}
                    urgent={s === "danger"}
                    delay={j * 60}
                    tag={s === "away" ? planLabel(r) : tagFor[s]}
                    selected={selected === r.id}
                    onClick={() => onSelect(r.id)}
                  />
                </div>
              );
            })}
          </div>
          {i === 0 && (
            <div className="street-road my-5" aria-hidden>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Elm Street
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
