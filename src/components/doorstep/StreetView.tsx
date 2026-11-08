import { House as HouseArt } from "./House";
import { RESIDENTS, markerState, planLabel, type Resolutions } from "@/lib/doorstep-data";

interface Props {
  resolved: Resolutions;
  selected: string | null;
  onSelect: (id: string) => void;
}

const tagFor: Record<string, string | null> = {
  safe: "Safe",
  help: "Needs help",
  danger: "Silent at home",
  away: "Away",
  unknown: "Unknown",
};

export function StreetView({ resolved, selected, onSelect }: Props) {
  const order = { danger: 0, help: 1, unknown: 2, safe: 3, away: 4 } as const;
  const sorted = [...RESIDENTS].sort(
    (a, b) => order[markerState(a, resolved)] - order[markerState(b, resolved)],
  );
  const half = Math.ceil(sorted.length / 2);
  const rows = [sorted.slice(0, half), sorted.slice(half)];
  return (
    <div className="street-scene absolute inset-0 z-[350] overflow-y-auto px-6 pb-28 pt-24">
      {rows.map((row, i) => (
        <div key={i}>
          <div className="grid grid-cols-5 gap-2 md:grid-cols-6 xl:grid-cols-8">
            {row.map((r, j) => {
              const s = markerState(r, resolved);
              return (
                <HouseArt
                  key={r.id}
                  resident={r}
                  planShown
                  porch={s === "safe" ? "safe" : s === "help" ? "help" : "off"}
                  state={s}
                  urgent={s === "danger"}
                  delay={j * 60}
                  tag={s === "away" ? planLabel(r) : (tagFor[s] ?? null)}
                  selected={selected === r.id}
                  onClick={() => onSelect(r.id)}
                />
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
