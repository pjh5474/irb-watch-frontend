"use client";

import { useCallback, useEffect, useState } from "react";

// Reading the clock lives here, outside any component, and is only called from event handlers
// and timers, never while rendering.
function clock(): number {
  return Date.now();
}

/**
 * A wait timer for slow requests: call start() when the wait begins (in the click handler) and
 * stop() when it ends. `ms` is the time since start(), updated every second; 0 when stopped.
 */
export function useElapsed() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(clock()), 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const start = useCallback(() => {
    const t = clock();
    setStartedAt(t);
    setNow(t);
  }, []);
  const stop = useCallback(() => setStartedAt(null), []);

  return { ms: startedAt === null ? 0 : Math.max(0, now - startedAt), start, stop };
}
