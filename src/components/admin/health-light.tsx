"use client";

import { useTranslations } from "next-intl";
import { StatusDot, type DotPulse, type DotTone } from "@/components/status-dot";
import type { AdminSource } from "@/lib/api/admin";
import { sourceHealth, type HealthLevel } from "@/lib/source-health";

// Healthy: a calm slow ring. Scanning and trouble: a faster one. Idle and off: a still dot.
const DOT: Record<HealthLevel, { tone: DotTone; pulse: DotPulse }> = {
  ok: { tone: "green", pulse: "slow" },
  scanning: { tone: "blue", pulse: "fast" },
  attention: { tone: "amber", pulse: "fast" },
  problem: { tone: "red", pulse: "fast" },
  idle: { tone: "gray", pulse: "none" },
  inactive: { tone: "gray", pulse: "none" },
};

// A status light for one source: green = scanned recently, blue = scanning now, amber = failed
// or out of date, red = a person must act, gray = never scanned or switched off. The colour is
// never the only signal: the words are always shown too.
export function HealthLight({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const { level, reason } = sourceHealth(source);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusDot tone={DOT[level].tone} pulse={DOT[level].pulse} />
      <span className={level === "problem" ? "font-medium text-red-700 dark:text-red-300" : ""}>
        {t(`health.${level}`)}
        {reason && <span className="opacity-80"> · {t(`healthReason.${reason}`)}</span>}
      </span>
    </span>
  );
}

// How many sources need a person's attention (amber or red), for the banner above the list.
export function sourcesNeedingAttention(sources: AdminSource[]): number {
  return sources.filter((s) => {
    const { level } = sourceHealth(s);
    return level === "attention" || level === "problem";
  }).length;
}
