"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ sessionEnded }: { sessionEnded: boolean }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  // false on the server and during hydration, true once the browser runs this code: the
  // submit button stays disabled until the onSubmit handler is really attached.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (signInError) {
      setError(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {sessionEnded && <p className="text-sm opacity-70">{t("sessionEnded")}</p>}
      {/* method="post": if this form is ever submitted natively (before the page's JavaScript
          has loaded, or if it failed to load), the browser must not put the email and password
          in the URL, which is what the default GET does. */}
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("email")}
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("password")}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {t("failed")}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !hydrated}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {t("submit")}
        </button>
      </form>
    </main>
  );
}
