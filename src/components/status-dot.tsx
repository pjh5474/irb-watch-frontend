import type { CSSProperties } from "react";

export type DotTone = "green" | "blue" | "amber" | "red" | "gray";
// none: still dot. slow: calm, "all fine". fast: "look at this".
export type DotPulse = "none" | "slow" | "fast";

const FILL: Record<DotTone, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-neutral-400",
};

const SPEED: Record<Exclude<DotPulse, "none">, string> = { slow: "2.8s", fast: "1.3s" };

// A small status dot. With a pulse, a soft ring spreads from it and fades (see .dot-ring in
// globals.css). The ring is decoration only: the meaning always comes with words next to the
// dot, and people who ask for reduced motion get a still dot.
export function StatusDot({ tone, pulse = "none" }: { tone: DotTone; pulse?: DotPulse }) {
  return (
    <span aria-hidden className="relative inline-flex size-2.5 shrink-0" data-pulse={pulse}>
      {pulse !== "none" && (
        <span
          className={`dot-ring absolute inset-0 rounded-full ${FILL[tone]}`}
          style={{ "--ring-speed": SPEED[pulse] } as CSSProperties}
        />
      )}
      <span className={`relative size-2.5 rounded-full transition-colors duration-300 ${FILL[tone]}`} />
    </span>
  );
}
