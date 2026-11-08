import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DoorstepBear } from "./DoorstepBear";

interface IncidentGuideProps {
  priorityCount: number;
  unconfirmed: number;
  pendingCount: number;
  nextHome: { shortName: string; address: string } | undefined;
  onReview: () => void;
}

export function IncidentGuide({
  priorityCount,
  unconfirmed,
  pendingCount,
  nextHome,
  onReview,
}: IncidentGuideProps) {
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const headline =
    priorityCount > 0
      ? `${priorityCount} ${priorityCount === 1 ? "home needs" : "homes need"} a check.`
      : "Priority home checks complete.";

  return (
    <div className="incident-guide">
      <Popover
        open={open}
        onOpenChange={(value) => {
          if (value) navigating.current = false;
          setOpen(value);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="incident-guide-trigger"
            aria-label="Open Doorstep response guide"
          >
            <span className="incident-guide-art">
              <DoorstepBear variant="mascot" className="incident-guide-bear" />
            </span>
            <span className="incident-guide-copy">
              <span className="incident-guide-eyebrow">Response guide</span>
              <strong className="incident-guide-headline">{headline}</strong>
              <span className="incident-guide-link">
                View brief <ArrowUpRight aria-hidden="true" />
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="incident-guide-popover z-[600] w-[min(21rem,calc(100vw-2rem))] rounded-md p-5 data-[state=open]:animate-none data-[state=closed]:animate-none"
          side="bottom"
          sideOffset={12}
          collisionPadding={16}
          aria-label="Doorstep response guide"
          onCloseAutoFocus={(event) => {
            if (navigating.current) event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker mb-2">Doorstep / Response brief</p>
              <h3 className="font-display text-xl font-semibold leading-snug">{headline}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2 shrink-0"
              aria-label="Close response guide"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          <dl className="my-4 border-y border-border py-1 text-sm">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted-foreground">Statewide unconfirmed</dt>
              <dd className="font-semibold tabular-nums">{unconfirmed}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted-foreground">Elm checks in progress</dt>
              <dd className="font-semibold tabular-nums">{pendingCount}</dd>
            </div>
          </dl>
          {nextHome ? (
            <div>
              <p className="text-xs text-muted-foreground">Next available household in Elm</p>
              <p className="mt-1 text-sm font-semibold">
                {nextHome.shortName}{" "}
                <span className="font-normal text-muted-foreground">· {nextHome.address}</span>
              </p>
              <Button
                className="mt-4 w-full justify-between text-xs"
                onClick={() => {
                  navigating.current = true;
                  setOpen(false);
                  onReview();
                }}
              >
                Review household <ArrowRight />
              </Button>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {pendingCount > 0
                ? "Checks are already in progress. Responses will appear in the household queue."
                : "No unanswered households remain in the Elm demo queue. The map still shows homes that have requested help."}
            </p>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            Simulated response · Elm household demo
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
