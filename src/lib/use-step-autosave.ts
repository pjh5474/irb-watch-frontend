"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type StepChange, pipelineApi } from "@/lib/api/pipelines";

/**
 * Background saving of a step's fields (owner, decided 2026-11-15; decisions.md "Step page
 * auto-save"). A picked value (status, result, a date) shows at once and is sent at once. Typed
 * text is sent about a second after the user stops typing, or when they leave the field. Changes
 * that come while a save runs are sent together right after it. The screen never waits for the
 * server, and a failed save never looks like no change: the status says "not saved: reason" with
 * a retry, and the unsaved value stays on screen.
 *
 * `serverStep` is the step as the server last sent it. A picked value is shown instead of the
 * server's while it is being saved or has failed, and after a good save until the page has been
 * reloaded (`serverStep` is a new object then).
 */
export type SavePhase = "idle" | "saving" | "saved" | "failed";

export const TYPING_PAUSE_MS = 1000;

type Shown = { values: StepChange; at: unknown };

export function useStepAutosave(
  pipelineId: number,
  stepId: number,
  serverStep: unknown,
  describeError: (error: unknown) => string,
) {
  const queryClient = useQueryClient();
  const pending = useRef<StepChange>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const describe = useRef(describeError);
  const server = useRef(serverStep);
  const [shown, setShown] = useState<Shown>({ values: {}, at: null });
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    describe.current = describeError;
    server.current = serverStep;
  });

  const send = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) return; // the running save takes what is pending when it ends
    if (Object.keys(pending.current).length === 0) return;
    inFlight.current = true;
    setPhase("saving");
    setError(null);
    try {
      while (Object.keys(pending.current).length > 0) {
        const take = pending.current;
        pending.current = {};
        try {
          await pipelineApi.updateStep(pipelineId, stepId, take);
        } catch (e) {
          pending.current = { ...take, ...pending.current }; // the newer value of a field wins
          setError(describe.current(e));
          setPhase("failed");
          return;
        }
      }
      setPhase("saved");
      // Not awaited: the page shows the new value already; the reload only refreshes the rest.
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    } finally {
      inFlight.current = false;
    }
  }, [pipelineId, stepId, queryClient]);

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  /** A picked value: shown now, saved now. */
  const pick = useCallback((change: StepChange) => {
    setShown((s) => ({ values: { ...s.values, ...change }, at: server.current }));
    pending.current = { ...pending.current, ...change };
    void sendRef.current();
  }, []);

  /** Typed text: saved after the pause (every key moves the pause), or at once by `flush`. */
  const type = useCallback((change: StepChange) => {
    pending.current = { ...pending.current, ...change };
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void sendRef.current();
    }, TYPING_PAUSE_MS);
  }, []);

  /** On leaving a field, and for "retry": send what is waiting now. */
  const flush = useCallback(() => {
    void sendRef.current();
  }, []);

  /** Forget what was not saved: shown values go back to the server's, typed fields reset. */
  const discard = useCallback((resetTyped: () => void) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = {};
    setShown({ values: {}, at: null });
    setPhase("idle");
    setError(null);
    resetTyped();
  }, []);

  /** The value to show: the picked one while it is not yet in the server's copy. */
  function value<K extends keyof StepChange>(key: K, serverValue: StepChange[K]): StepChange[K] {
    const live = phase === "saving" || phase === "failed" || shown.at === serverStep;
    return live && key in shown.values ? shown.values[key] : serverValue;
  }

  // Leaving the page (a link inside the app) sends what is waiting; closing the tab asks first.
  useEffect(() => {
    const ask = (e: BeforeUnloadEvent) => {
      const waiting = inFlight.current || timer.current !== null || Object.keys(pending.current).length > 0;
      if (waiting || phase === "failed") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [phase]);
  useEffect(
    () => () => {
      if (Object.keys(pending.current).length > 0) void sendRef.current();
    },
    [],
  );

  return { phase, error, value, pick, type, flush, discard };
}
