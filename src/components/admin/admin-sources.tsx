"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { HealthLight, sourcesNeedingAttention } from "@/components/admin/health-light";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { adminApi, type AdminSource } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

export const SOURCES_KEY = ["admin", "sources"] as const;

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" | "good" }) {
  const tones = {
    plain: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100",
    good: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-100",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function AdminSources() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const scan = useSingleFlight();
  const add = useSingleFlight();
  const mail = useSingleFlight();
  const [form, setForm] = useState({ name: "", url: "", login: "" });

  // While any scan runs, ask again every 4 seconds so its result shows up by itself.
  const query = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: adminApi.sources,
    refetchInterval: (q) => (q.state.data?.some((s) => s.scan_in_progress) ? 4000 : false),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
  const needAttention = query.data ? sourcesNeedingAttention(query.data) : 0;

  async function scanOne(source: AdminSource) {
    setMessage(null);
    await scan.run(async () => {
      try {
        await adminApi.scanSource(source.id);
        setMessage({ kind: "ok", text: t("scanStarted", { name: source.name }) });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  async function scanAll() {
    setMessage(null);
    await scan.run(async () => {
      try {
        await adminApi.scanAll();
        setMessage({ kind: "ok", text: t("scanAllStarted") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  // Sends a test mail to the signed-in admin's own address. The server answers 409 when mail is
  // not set up and 502 with the mail service's reason when the send is refused; both are shown.
  async function sendTestMail() {
    setMessage(null);
    await mail.run(async () => {
      try {
        await adminApi.sendTestMail();
        setMessage({ kind: "ok", text: t("testMailSent") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    await add.run(async () => {
      try {
        await adminApi.createSource({
          name: form.name,
          url: form.url,
          login_user: form.login.trim() || null,
        });
        setForm({ name: "", url: "", login: "" });
        setMessage({ kind: "ok", text: t("sourceAdded") });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("sourcesTitle")}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={sendTestMail} disabled={mail.busy} aria-busy={mail.busy}>
            {mail.busy && <Spinner aria-hidden />}
            {t("sendTestMail")}
          </Button>
          <Button variant="outline" size="sm" onClick={scanAll} disabled={scan.busy}>
            {scan.busy && <Spinner aria-hidden />}
            {t("scanAll")}
          </Button>
        </div>
      </div>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-4 text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}

      {query.isLoading && <p className="mt-6 text-sm opacity-70">{t("loading")}</p>}
      {query.isError && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {adminErrorText(query.error, t)}
        </p>
      )}
      {query.data?.length === 0 && <p className="mt-6 text-sm opacity-70">{t("noSources")}</p>}
      {query.data && needAttention > 0 && (
        <p
          role="alert"
          className="mt-6 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {t("attentionBanner", { n: needAttention })}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {query.data?.map((source, index) => (
          <li
            key={source.id}
            className="reveal rounded border p-4"
            style={{ "--i": index } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-center gap-2">
              <HealthLight source={source} />
              <Link href={`/admin/sources/${source.id}`} className="font-medium underline-offset-4 hover:underline">
                {source.name}
              </Link>
              {source.requires_login ? <Badge tone="warn">{t("membersOnly")}</Badge> : <Badge>{t("public")}</Badge>}
              <Badge tone={source.ai_enabled ? "good" : "plain"}>{source.ai_enabled ? t("aiOn") : t("aiOff")}</Badge>
              {!source.is_active && <Badge>{t("inactive")}</Badge>}
              {source.scan_in_progress && (
                <Badge tone="good">
                  <Spinner className="mr-1 inline size-3" aria-hidden />
                  {t("scanning")}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => scanOne(source)}
                disabled={scan.busy || source.scan_in_progress}
              >
                {t("scanNow")}
              </Button>
            </div>
            <p className="mt-2 text-xs opacity-70">
              {source.last_scan_at
                ? t("lastScan", {
                    date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                    status: source.last_scan_status ?? "?",
                  })
                : t("neverScanned")}
            </p>
            {source.scans_paused_reason && (
              <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                {t("paused", { reason: source.scans_paused_reason })}
              </p>
            )}
            {source.last_scan_error && source.last_scan_status !== "ok" && (
              <p className="mt-2 text-sm text-red-600">{t("scanProblem", { reason: source.last_scan_error })}</p>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={addSource} className="mt-8 flex flex-col gap-3 rounded border p-4">
        <h2 className="font-medium">{t("addTitle")}</h2>
        <label className="flex flex-col gap-1 text-sm">
          {t("name")}
          <input
            className="rounded border px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("url")}
          <input
            className="rounded border px-3 py-2"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://hrpp.snuh.org/hrpp/bbs/list.do?key=2605277031"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("loginLabel")}
          <input
            className="rounded border px-3 py-2"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            placeholder="study-1"
            autoComplete="off"
          />
          <span className="text-xs opacity-70">{t("loginLabelHint")}</span>
        </label>
        <div>
          <Button type="submit" size="sm" disabled={add.busy} aria-busy={add.busy}>
            {add.busy && <Spinner aria-hidden />}
            {t("add")}
          </Button>
        </div>
      </form>
    </main>
  );
}
