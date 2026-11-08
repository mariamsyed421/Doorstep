import type React from "react";
import type { Resident } from "@/lib/doorstep-data";
import { cn } from "@/lib/utils";

export type Porch = "off" | "safe" | "help";

interface Props {
  resident: Resident;
  planShown: boolean;
  porch: Porch;
  urgent: boolean;
  intensity?: number;
  delay: number;
  tag?: string | null;
  state?: "safe" | "help" | "danger" | "awaiting" | "away" | "unknown";
  selected: boolean;
  onClick: () => void;
}

export function House({
  resident,
  planShown,
  porch,
  urgent,
  intensity = 1,
  delay,
  tag,
  state,
  selected,
  onClick,
}: Props) {
  const away = state
    ? state === "away"
    : planShown && (resident.planAnswer === "family" || resident.planAnswer === "shelter");
  const lit = state ? state === "safe" : planShown && resident.planAnswer === "home";
  const unknown = state ? state === "unknown" : planShown && resident.planAnswer === null;
  const ts = { transitionDelay: `${delay}ms` };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${resident.name}, ${resident.address}`}
      className={cn(
        "group relative flex flex-col items-center rounded-2xl p-2 pt-3 transition-all duration-500 focus-visible:outline-3 focus-visible:outline-ring",
        selected && "house-selected",
        urgent && "danger-glow",
        state === "help" && "help-glow",
      )}
      style={urgent ? ({ "--glow": intensity } as React.CSSProperties) : undefined}
    >
      {unknown && (
        <span className="absolute right-2 top-1 z-10 grid h-7 w-7 place-items-center rounded-full bg-unknown text-sm font-bold text-primary-foreground">
          ?
        </span>
      )}
      <svg
        viewBox="0 0 120 110"
        className={cn(
          "house w-full max-w-28 transition-opacity duration-700",
          lit && "lit",
          porch === "safe" && "porch-safe",
          porch === "help" && "porch-help",
        )}
        style={{ ...ts, opacity: away ? 0.4 : 1 }}
      >
        <polygon className="roof" points="8,50 60,10 112,50" />
        <rect className="trim" x="82" y="18" width="12" height="20" />
        <rect className="wall" x="18" y="48" width="84" height="56" rx="3" />
        <rect className="win" x="28" y="58" width="22" height="18" rx="2" style={ts} />
        <rect className="win" x="70" y="58" width="22" height="18" rx="2" style={ts} />
        <rect className="trim" x="51" y="72" width="18" height="32" rx="2" />
        <circle className="halo" cx="60" cy="66" r="14" style={ts} />
        <circle className="porch" cx="60" cy="66" r="4" style={ts} />
      </svg>
      <span className="mt-1 text-sm font-semibold">{resident.address.split(" ")[0]}</span>
      <span className="text-xs text-muted-foreground">{resident.shortName}</span>
      <span
        className={cn(
          "mt-0.5 min-h-5 max-w-32 truncate text-xs transition-opacity duration-500",
          tag ? "opacity-100 text-muted-foreground" : "opacity-0",
          state === "help" && "font-semibold text-alert",
          state === "danger" && "font-semibold text-danger",
          state === "awaiting" && "font-semibold text-light",
          state === "away" && "text-[11px] italic",
        )}
        title={tag ?? undefined}
      >
        {tag ?? "."}
      </span>
    </button>
  );
}
