"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { useSingleFlight } from "@/lib/use-single-flight";

type State = "ask" | "done" | "invalid" | "error";

// The page behind the footer link of every digest mail. No login: the signed token in the
// address is the proof. The button sends it to the API (POST), which turns this one user's
// digest off. Opening the page changes nothing, so a link scanner cannot unsubscribe anyone.
export function UnsubscribeForm({ token }: { token: string | null }) {
  const t = useTranslations("unsubscribe");
  const [state, setState] = useState<State>(token ? "ask" : "invalid");
  const flight = useSingleFlight();

  async function submit() {
    if (!token) return;
    await flight.run(async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/unsubscribe?token=${encodeURIComponent(token)}`,
          { method: "POST" },
        );
        if (response.ok) setState("done");
        else if (response.status === 400) setState("invalid");
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
          <div>
            <Button onClick={submit} disabled={flight.busy} aria-busy={flight.busy}>
              {flight.busy && <Spinner aria-hidden />}
              {flight.busy ? t("working") : t("button")}
            </Button>
          </div>
        </>
      )}
      {state === "done" && (
        <>
          <p role="status" className="text-sm">
            {t("done")}
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
