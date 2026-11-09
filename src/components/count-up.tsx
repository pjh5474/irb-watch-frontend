"use client";

import { useFormatter } from "next-intl";
import { useEffect, useState } from "react";

const DURATION_MS = 700;

// A number that counts up from 0 once when it appears. The server renders the final value (so
// the page is right without JavaScript), screen readers always read the final value, and
// people who ask for reduced motion get it with no animation.
//
// `state.target` remembers which value the animation was for. Whenever it differs from the
// current `value` (the number changed, or no animation runs for it), the real value is shown,
// so the visible number can never be left on an old one.
export function CountUp({ value }: { value: number }) {
  const format = useFormatter();
  const [state, setState] = useState({ target: value, shown: value });

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3); // fast at first, slowing down
      setState({ target: value, shown: Math.round(value * eased) });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const display = state.target === value ? state.shown : value;

  return (
    <>
      <span className="sr-only">{format.number(value)}</span>
      <span aria-hidden className="tabular-nums">
        {format.number(display)}
      </span>
    </>
  );
}
