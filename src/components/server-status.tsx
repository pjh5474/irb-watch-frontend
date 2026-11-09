"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusDot, type DotPulse, type DotTone } from "@/components/status-dot";
import { API_REACHABLE, API_UNREACHABLE } from "@/lib/api/status";

type State = "checking" | "online" | "offline";

// Online: a calm slow ring. Checking: gray and quick. Offline: a red ring that draws the eye.
const DOT: Record<State, { tone: DotTone; pulse: DotPulse }> = {
  checking: { tone: "gray", pulse: "fast" },
  online: { tone: "green", pulse: "slow" },
  offline: { tone: "red", pulse: "fast" },
};

// Small dot in the header: is the API server answering? Checked once when the page loads,
// again after any call that got no answer at all, and when the user clicks it. There is no
// background polling. A successful call also turns it green without an extra request.
export function ServerStatus() {
  const t = useTranslations("status");
  const [state, setState] = useState<State>("checking");
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setState("checking");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      setState(response.ok ? "online" : "offline");
    } catch {
      setState("offline");
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    // The first check runs from a timer callback so the effect itself sets no state.
    const first = setTimeout(() => void check(), 0);
    const onReachable = () => setState("online");
    const onUnreachable = () => void check();
    window.addEventListener(API_REACHABLE, onReachable);
    window.addEventListener(API_UNREACHABLE, onUnreachable);
    return () => {
      clearTimeout(first);
      window.removeEventListener(API_REACHABLE, onReachable);
      window.removeEventListener(API_UNREACHABLE, onUnreachable);
    };
  }, [check]);

  return (
    <button
      type="button"
      onClick={() => void check()}
      title={t("recheck")}
      aria-live="polite"
      className="flex items-center gap-2 text-xs"
    >
      <StatusDot tone={DOT[state].tone} pulse={DOT[state].pulse} />
      <span className="hidden sm:inline">{t(state)}</span>
      <span className="sr-only sm:hidden">{t(state)}</span>
    </button>
  );
}
