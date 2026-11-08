import { cn } from "@/lib/utils";

interface DoorstepBearProps {
  variant?: "mark" | "mascot";
  className?: string;
  decorative?: boolean;
}

export function DoorstepBear({
  variant = "mark",
  className,
  decorative = true,
}: DoorstepBearProps) {
  const fullBody = variant === "mascot";
  return (
    <img
      src={fullBody ? "/brand/doorstep-bear.svg" : "/brand/doorstep-mark.svg"}
      width={fullBody ? 240 : 220}
      height={fullBody ? 300 : 218}
      alt={decorative ? "" : "Doorstep bear wearing a red bandana"}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
      className={cn("doorstep-bear block shrink-0 select-none object-contain", className)}
    />
  );
}

export function MapLoadingState() {
  return (
    <div className="mascot-loading flex h-full items-center gap-5 p-8" role="status">
      <DoorstepBear variant="mascot" className="h-20 w-16" />
      <div>
        <p className="font-display text-xl font-semibold">Loading Texas map…</p>
        <p className="mt-2 max-w-64 text-sm leading-relaxed text-muted-foreground">
          Preparing county boundaries and response layers.
        </p>
      </div>
    </div>
  );
}
