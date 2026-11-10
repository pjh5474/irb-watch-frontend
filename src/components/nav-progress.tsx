"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START = "irb-nav-start";

// Starts the same top bar for a navigation that is not a link click, such as applying filters.
export function startNavProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(START));
}

// Thin bar at the top while a page change is loading. Next.js gives no navigation events in
// the app router, so it starts on a click on an internal link (or startNavProgress) and ends
// when the URL changes (or after 15 s, so it can never stay on forever). While it runs,
// <html data-nav-pending="true"> lets the feed dim its lists.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // While `startedAt` still equals the current URL, the page has not changed yet.
  const active = startedAt !== null && startedAt === here;

  useEffect(() => {
    function begin() {
      const current = `${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`;
      setStartedAt(current);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStartedAt(null), 15_000);
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = `${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`;
      if (`${url.pathname}?${url.search.replace(/^\?/, "")}` === current) return;
      begin();
    }
    document.addEventListener("click", onClick);
    window.addEventListener(START, begin);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START, begin);
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (active) document.documentElement.dataset.navPending = "true";
    else delete document.documentElement.dataset.navPending;
    return () => {
      delete document.documentElement.dataset.navPending;
    };
  }, [active]);

  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-busy="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20"
    >
      <div className="irb-progress-bar h-full w-1/3 bg-primary" />
    </div>
  );
}
