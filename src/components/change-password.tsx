"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD } from "@/lib/api/users";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

/** What is wrong with the new password before anything is sent, or null. */
export function newPasswordProblem(current: string, next: string, repeat: string): "current" | "short" | "same" | "repeat" | null {
  if (!current) return "current";
  if (next.length < MIN_PASSWORD) return "short";
  if (next === current) return "same";
  if (next !== repeat) return "repeat";
  return null;
}

// Changes the signed-in user's own password. The current password is checked first (a fresh
// sign-in with it), so someone at an unlocked screen cannot change it, and the fresh sign-in
// also satisfies Supabase's "recent sign-in" rule for password changes. Passwords are never
// stored or logged here.
export function ChangePassword() {
  const t = useTranslations("settings");
  const send = useSingleFlight();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const problem = newPasswordProblem(current, next, repeat);
    if (problem) {
      const key = { current: "pwNeedCurrent", short: "pwShort", same: "pwSame", repeat: "pwRepeat" }[problem];
      return setMessage({ kind: "error", text: t(key, { n: MIN_PASSWORD }) });
    }
    await send.run(async () => {
      try {
        const supabase = createClient();
        const { data, error: userError } = await supabase.auth.getUser();
        const email = data.user?.email;
        if (userError || !email) return setMessage({ kind: "error", text: t("pwNoSession") });
        const check = await supabase.auth.signInWithPassword({ email, password: current });
        if (check.error) return setMessage({ kind: "error", text: t("pwWrongCurrent") });
        const { error } = await supabase.auth.updateUser({ password: next });
        if (error) return setMessage({ kind: "error", text: t("pwFailed", { reason: error.message }) });
        setCurrent("");
        setNext("");
        setRepeat("");
        setMessage({ kind: "ok", text: t("pwChanged") });
      } catch {
        setMessage({ kind: "error", text: t("pwUnreachable") });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("pwCurrent")}
        <input
          type="password"
          autoComplete="current-password"
          className="rounded border px-3 py-2"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("pwNew")}
        <input
          type="password"
          autoComplete="new-password"
          className="rounded border px-3 py-2"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("pwRepeatLabel")}
        <input
          type="password"
          autoComplete="new-password"
          className="rounded border px-3 py-2"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      <p className="text-xs opacity-70">{t("pwHint", { n: MIN_PASSWORD })}</p>
      <div>
        <Button type="submit" size="sm" disabled={send.busy} aria-busy={send.busy}>
          {send.busy && <Spinner aria-hidden />}
          {t("pwSubmit")}
        </Button>
      </div>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
