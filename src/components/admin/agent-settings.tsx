"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { agentApi } from "@/lib/api/agent";
import { useSingleFlight } from "@/lib/use-single-flight";

const KEY = ["admin", "agent-limits"] as const;

// A whole number from 0 to 1000, as the server also requires.
export function parseLimit(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const value = Number(text);
  return value <= 1000 ? value : null;
}

export function AgentSettings() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const query = useQuery({ queryKey: KEY, queryFn: agentApi.limits });
  // null = nothing typed yet: the fields show the saved values.
  const [form, setForm] = useState<{ user: string; admin: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const saved = query.data;
  const shown = form ?? (saved ? { user: String(saved.user_daily_limit), admin: String(saved.admin_daily_limit) } : null);
  const userLimit = shown ? parseLimit(shown.user) : null;
  const adminLimit = shown ? parseLimit(shown.admin) : null;
  const valid = userLimit !== null && adminLimit !== null;
  const changed = Boolean(
    saved && valid && (userLimit !== saved.user_daily_limit || adminLimit !== saved.admin_daily_limit),
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !changed) return;
    setMessage(null);
    await flight.run(async () => {
      try {
        await agentApi.saveLimits({ user_daily_limit: userLimit, admin_daily_limit: adminLimit });
        setForm(null);
        setMessage({ kind: "ok", text: t("agent.saved") });
        await queryClient.invalidateQueries({ queryKey: KEY });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const field = (key: "user" | "admin", label: string, parsed: number | null) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className="w-32 rounded border px-3 py-2"
        inputMode="numeric"
        value={shown?.[key] ?? ""}
        onChange={(e) => setForm({ ...(shown ?? { user: "", admin: "" }), [key]: e.target.value })}
        disabled={!shown}
        aria-invalid={shown !== null && parsed === null}
      />
    </label>
  );

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Section icon={Bot} accent="violet" level={1} title={t("agent.title")}>
        <p className="text-sm opacity-80">{t("agent.intro")}</p>
        {query.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
        {query.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(query.error, t)}
          </p>
        )}
        {saved && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              {field("user", t("agent.userLimit"), userLimit)}
              {field("admin", t("agent.adminLimit"), adminLimit)}
            </div>
            <p className={`text-xs ${shown && !valid ? "text-red-600" : "opacity-70"}`}>
              {shown && !valid ? t("agent.invalid") : t("agent.range")}
            </p>
            <div>
              <Button type="submit" size="sm" disabled={flight.busy || !valid || !changed} aria-busy={flight.busy}>
                {flight.busy && <Spinner aria-hidden />}
                {t("agent.save")}
              </Button>
            </div>
          </form>
        )}
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
          >
            {message.text}
          </p>
        )}
      </Section>
    </main>
  );
}
