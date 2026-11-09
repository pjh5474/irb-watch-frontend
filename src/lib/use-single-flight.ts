"use client";

import { useCallback, useRef, useState } from "react";

// Runs an async action at most once at a time. A ref (not state) is the guard: state changes
// only show after the next render, so two clicks in the same instant would both get through.
export function useSingleFlight() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
