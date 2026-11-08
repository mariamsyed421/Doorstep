"use client";

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const liquidbuttonVariants = cva(
  "liquid-button relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "liquid-button--clear text-foreground",
        primary: "liquid-button--primary text-primary-foreground",
        destructive: "liquid-button--destructive text-primary-foreground",
        secondary: "liquid-button--clear text-foreground",
      },
      size: {
        default: "min-h-10 px-5 py-2",
        sm: "min-h-8 px-3 py-1.5 text-xs",
        lg: "min-h-12 px-6 py-3",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidbuttonVariants> {
  asChild?: boolean;
}

// Adapted from the supplied 21st.dev liquid glass button. Keep the optical
// layers separate from the content so refraction never blurs labels or icons.
const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant, size, asChild = false, children, style, type, ...props }, ref) => {
    const filterId = `liquid-glass-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        type={asChild ? type : (type ?? "button")}
        data-slot="liquid-button"
        className={cn(liquidbuttonVariants({ variant, size }), className)}
        style={{ ...style, "--liquid-filter": `url("#${filterId}")` } as React.CSSProperties}
        {...props}
      >
        <span className="liquid-button__refraction" aria-hidden="true" />
        <Slottable>{children}</Slottable>
        <svg className="pointer-events-none absolute size-0" aria-hidden="true" focusable="false">
          <defs>
            <filter
              id={filterId}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.05 0.05"
                numOctaves="1"
                seed="1"
                result="turbulence"
              />
              <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="blurredNoise"
                scale="8"
                xChannelSelector="R"
                yChannelSelector="B"
              />
            </filter>
          </defs>
        </svg>
      </Comp>
    );
  },
);
LiquidButton.displayName = "LiquidButton";

export { LiquidButton, liquidbuttonVariants };
