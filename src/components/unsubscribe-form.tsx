"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { useSingleFlight } from "@/lib/use-single-flight";

type State = "ask" | "done" | "invalid" | "error";
type Part = "news" | "reminders";

// The page behind the footer link of every daily mail. No login: the signed token in the
// address is the proof. The user picks what to stop (the document news, the IRB step
// reminders, or both; both are ticked at first) and the button sends that to the API (POST).
// Opening the page changes nothing, so a link scanner cannot unsubscribe anyone. The one-click
// button of mail apps posts without a choice, which stops both.
export function UnsubscribeForm({ token }: { token: string | null }) {
  const t = useTranslations("unsubscribe");
  const [state, setState] = useState<State>(token ? "ask" : "invalid");
  const [stop, setStop] = useState<Set<Part>>(new Set(["news", "reminders"]));
  const [stopped, setStopped] = useState<Part[]>([]);
  const flight = useSingleFlight();

  function toggle(part: Part, on: boolean) {
    const next = new Set(stop);
    if (on) next.add(part);
    else next.delete(part);
    setStop(next);
  }

  async function submit() {
    if (!token || stop.size === 0) return;
    const parts = (["news", "reminders"] as const).filter((p) => stop.has(p));
    const query = [`token=${encodeURIComponent(token)}`, ...parts.map((p) => `stop=${p}`)].join("&");
    await flight.run(async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/unsubscribe?${query}`, { method: "POST" });
        if (response.ok) {
          setStopped(parts);
          setState("done");
        } else if (response.status === 400) setState("invalid");
        else setState("error");
      } catch {
        setState("error"); // no answer at all: the server or the network
      }
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {state === "ask" && (
        <>
          <p className="text-sm">{t("question")}</p>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="sr-only">{t("choose")}</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={stop.has("news")} onChange={(e) => toggle("news", e.target.checked)} />
              {t("news")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={stop.has("reminders")}
                onChange={(e) => toggle("reminders", e.target.checked)}
              />
              {t("reminders")}
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} disabled={flight.busy || stop.size === 0} aria-busy={flight.busy}>
              {flight.busy && <Spinner aria-hidden />}
              {flight.busy ? t("working") : t("button")}
            </Button>
            {stop.size === 0 && <span className="text-xs opacity-70">{t("chooseOne")}</span>}
          </div>
        </>
      )}
      {state === "done" && (
        <>
          <p role="status" className="text-sm">
            {stopped.length === 2 ? t("done") : stopped[0] === "news" ? t("doneNews") : t("doneReminders")}
          </p>
          <Link href="/settings" className="text-sm underline-offset-4 hover:underline">
            {t("settingsLink")}
          </Link>
        </>
      )}
      {state === "invalid" && (
        <p role="alert" className="text-sm text-red-600">
          {t("invalid")}
        </p>
      )}
      {state === "error" && (
        <>
          <p role="alert" className="text-sm text-red-600">
            {t("error")}
          </p>
          <div>
            <Button variant="outline" onClick={() => setState("ask")}>
              {t("tryAgain")}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
