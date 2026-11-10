"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { AddSourceDialog } from "@/components/admin/add-source-dialog";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { HealthLight, sourcesNeedingAttention } from "@/components/admin/health-light";
import { LoginBadge, loginStateOf, useStoredLogins } from "@/components/admin/login-badge";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { adminApi, type AdminSource } from "@/lib/api/admin";
import { clampPage, pageCount, pageRange } from "@/lib/paging";
import { groupBySite } from "@/lib/site-groups";
import { sourceHealth, type HealthLevel } from "@/lib/source-health";
import { useSingleFlight } from "@/lib/use-single-flight";

export const SOURCES_KEY = ["admin", "sources"] as const;

// Kept here too, so existing imports of Badge from this file keep working.
export { Badge };

const GROUPS_PER_PAGE = 20;
// With this many groups or fewer (a small setup) every group starts open.
const OPEN_UP_TO = 10;

type HealthFilter = "" | "needsAttention" | HealthLevel;
const HEALTH_FILTERS: HealthFilter[] = ["", "needsAttention", "problem", "attention", "scanning", "ok", "idle", "inactive"];

type Message = { kind: "ok" | "error"; text: string } | null;

function matchesHealth(source: AdminSource, filter: HealthFilter): boolean {
  if (!filter) return true;
  const { level } = sourceHealth(source);
  if (filter === "needsAttention") return level === "attention" || level === "problem";
  return level === filter;
}

export function AdminSources() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<Message>(null);
  const scan = useSingleFlight();
  const mail = useSingleFlight();
  const bulk = useSingleFlight();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<HealthFilter>("");
  const [site, setSite] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Groups the admin opened or closed by hand; the rest follow the default.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());

  // While any scan runs, ask again every 4 seconds so its result shows up by itself.
  const query = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: adminApi.sources,
    refetchInterval: (q) => (q.state.data?.some((s) => s.scan_in_progress) ? 4000 : false),
  });
  const logins = useStoredLogins(query.data);
  const all = useMemo(() => query.data ?? [], [query.data]);
  const allGroups = useMemo(() => groupBySite(all), [all]);

  const term = search.trim().toLowerCase();
  const filtered = Boolean(term || health || site);
  const groups = useMemo(
    () =>
      allGroups
        .filter((g) => !site || g.key === site)
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (s) =>
              matchesHealth(s, health) &&
              (!term || s.name.toLowerCase().includes(term) || g.label.toLowerCase().includes(term) || s.url.toLowerCase().includes(term)),
          ),
        }))
        .filter((g) => g.items.length > 0),
    [allGroups, site, health, term],
  );
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  const pages = pageCount(groups.length, GROUPS_PER_PAGE);
  const currentPage = clampPage(page, pages);
  const [from, to] = pageRange(currentPage, GROUPS_PER_PAGE);
  const visibleGroups = groups.slice(from, to + 1);
  const openByDefault = filtered || allGroups.length <= OPEN_UP_TO;
  const isOpen = (key: string) => toggled.get(key) ?? openByDefault;

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }), [queryClient]);
  const needAttention = query.data ? sourcesNeedingAttention(query.data) : 0;
  const chosen = all.filter((s) => selected.has(s.id));

  function filterChanged<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  function toggleOne(id: number) {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: number[], on: boolean) {
    setSelected((now) => {
      const next = new Set(now);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function act(run: () => Promise<unknown>, ok: string) {
    setMessage(null);
    await scan.run(async () => {
      try {
        await run();
        setMessage({ kind: "ok", text: ok });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  async function mailAction(run: () => Promise<unknown>, ok: string) {
    setMessage(null);
    await mail.run(async () => {
      try {
        await run();
        setMessage({ kind: "ok", text: ok });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  // One change per source, one after another; every failure is reported with its reason.
  async function bulkUpdate(change: { ai_enabled?: boolean; is_active?: boolean }, label: string) {
    setMessage(null);
    await bulk.run(async () => {
      const failures: string[] = [];
      for (const source of chosen) {
        try {
          await adminApi.updateSource(source.id, change);
        } catch (e) {
          failures.push(`${source.name}: ${adminErrorText(e, t)}`);
        }
      }
      const done = chosen.length - failures.length;
      setMessage(
        failures.length
          ? { kind: "error", text: t("bulk.partly", { action: label, done, failed: failures.length, reasons: failures.join("; ") }) }
          : { kind: "ok", text: t("bulk.done", { action: label, n: done }) },
      );
      await refresh();
    });
  }

  async function scanChosen() {
    setMessage(null);
    await bulk.run(async () => {
      try {
        const result = await adminApi.scanSelected(chosen.map((s) => s.id));
        setMessage({ kind: "ok", text: t("bulk.scanStarted", { n: result.count }) });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
      await refresh();
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("sourcesTitle")}</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("addTitle")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => act(adminApi.scanAll, t("scanAllStarted"))} disabled={scan.busy}>
            {scan.busy && <Spinner aria-hidden />}
            {t("scanAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mailAction(adminApi.sendTestMail, t("testMailSent"))}
            disabled={mail.busy}
            aria-busy={mail.busy}
          >
            {t("sendTestMail")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mailAction(adminApi.sendWeeklyPreview, t("weeklyPreviewSent"))}
            disabled={mail.busy}
            aria-busy={mail.busy}
          >
            {t("sendWeeklyPreview")}
          </Button>
        </div>
      </div>

      {adding && (
        <AddSourceDialog
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            setMessage({ kind: "ok", text: t("sourceAddedNamed", { name }) });
            void refresh();
          }}
        />
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-4 text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}

      {query.data && needAttention > 0 && (
        <p
          role="alert"
          className="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {t("attentionBanner", { n: needAttention })}{" "}
          <button type="button" className="underline" onClick={() => filterChanged(setHealth)("needsAttention")}>
            {t("showThem")}
          </button>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 text-sm" role="search">
        <label className="flex flex-col gap-1">
          {t("list.search")}
          <input
            className="w-64 rounded border px-2 py-1"
            value={search}
            placeholder={t("list.searchPlaceholder")}
            onChange={(e) => filterChanged(setSearch)(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          {t("list.health")}
          <select className="rounded border px-2 py-1" value={health} onChange={(e) => filterChanged(setHealth)(e.target.value as HealthFilter)}>
            {HEALTH_FILTERS.map((h) => (
              <option key={h} value={h}>
                {h === "" ? t("list.anyHealth") : h === "needsAttention" ? t("list.needsAttention") : t(`health.${h}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("list.site")}
          <select className="max-w-64 rounded border px-2 py-1" value={site} onChange={(e) => filterChanged(setSite)(e.target.value)}>
            <option value="">{t("list.anySite")}</option>
            {allGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label} ({g.items.length})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 pb-0.5">
          <Button variant="ghost" size="sm" onClick={() => setToggled(new Map(groups.map((g) => [g.key, true])))}>
            {t("list.openAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setToggled(new Map(groups.map((g) => [g.key, false])))}>
            {t("list.closeAll")}
          </Button>
        </div>
      </div>

      {query.isLoading && <p className="mt-6 text-sm opacity-70">{t("loading")}</p>}
      {query.isError && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {adminErrorText(query.error, t)}
        </p>
      )}
      {query.data && (
        <p className="mt-3 text-xs opacity-70">
          {query.data.length === 0
            ? t("noSources")
            : t("list.counts", { shown: shownCount, total: all.length, groups: groups.length })}
        </p>
      )}

      {selected.size > 0 && (
        <div
          className="sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-sm shadow-sm"
          aria-label={t("bulk.label")}
        >
          <span className="font-medium">{t("bulk.selected", { n: selected.size })}</span>
          <Button size="sm" variant="outline" disabled={bulk.busy} onClick={scanChosen}>
            {bulk.busy && <Spinner aria-hidden />}
            {t("bulk.scan")}
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.busy} onClick={() => bulkUpdate({ ai_enabled: true }, t("bulk.aiOn"))}>
            {t("bulk.aiOn")}
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.busy} onClick={() => bulkUpdate({ ai_enabled: false }, t("bulk.aiOff"))}>
            {t("bulk.aiOff")}
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.busy} onClick={() => bulkUpdate({ is_active: true }, t("bulk.activate"))}>
            {t("bulk.activate")}
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.busy} onClick={() => bulkUpdate({ is_active: false }, t("bulk.deactivate"))}>
            {t("bulk.deactivate")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("bulk.clear")}
          </Button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs opacity-70">
              <th className="w-8 p-2">
                <span className="sr-only">{t("list.select")}</span>
              </th>
              <th className="p-2">{t("list.colSource")}</th>
              <th className="p-2">{t("list.colHealth")}</th>
              <th className="p-2">{t("list.colAccess")}</th>
              <th className="p-2">{t("list.colLastScan")}</th>
              <th className="p-2 text-right">{t("list.colActions")}</th>
            </tr>
          </thead>
          {visibleGroups.map((group) => {
            const open = isOpen(group.key);
            const ids = group.items.map((s) => s.id);
            const allChosen = ids.every((id) => selected.has(id));
            const trouble = group.items.filter((s) => {
              const { level } = sourceHealth(s);
              return level === "attention" || level === "problem";
            }).length;
            return (
              <tbody key={group.key} className="border-b">
                <tr className="bg-neutral-50 dark:bg-neutral-900">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={t("list.selectGroup", { name: group.label })}
                      checked={allChosen}
                      onChange={(e) => toggleGroup(ids, e.target.checked)}
                    />
                  </td>
                  <td className="p-2" colSpan={5}>
                    <button
                      type="button"
                      className="flex items-center gap-1 font-medium"
                      aria-expanded={open}
                      onClick={() => setToggled((m) => new Map(m).set(group.key, !open))}
                    >
                      {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                      {group.label}{" "}
                      <span className="font-normal opacity-60">
                        · {group.kind === "rbay" ? "R-BAY" : group.key} · {t("list.boards", { n: group.items.length })}
                      </span>
                      {trouble > 0 && (
                        <Badge tone="warn">{t("list.trouble", { n: trouble })}</Badge>
                      )}
                    </button>
                  </td>
                </tr>
                {open &&
                  group.items.map((source) => (
                    <tr key={source.id} className="border-t align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={t("list.selectOne", { name: source.name })}
                          checked={selected.has(source.id)}
                          onChange={() => toggleOne(source.id)}
                        />
                      </td>
                      <td className="p-2">
                        <Link href={`/admin/sources/${source.id}`} className="font-medium underline-offset-4 hover:underline">
                          {source.name}
                        </Link>
                        {source.scans_paused_reason && (
                          <p role="alert" className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                            {t("paused", { reason: source.scans_paused_reason })}
                          </p>
                        )}
                        {source.last_scan_error && source.last_scan_status !== "ok" && (
                          <p className="mt-1 text-xs text-red-600">{t("scanProblem", { reason: source.last_scan_error })}</p>
                        )}
                      </td>
                      <td className="p-2">
                        <HealthLight source={source} />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {source.requires_login ? <Badge tone="warn">{t("membersOnly")}</Badge> : <Badge>{t("public")}</Badge>}
                          <LoginBadge state={loginStateOf(source, logins)} error={logins.error} />
                          <Badge tone={source.ai_enabled ? "good" : "plain"}>{source.ai_enabled ? t("aiOn") : t("aiOff")}</Badge>
                          {!source.is_active && <Badge>{t("inactive")}</Badge>}
                        </div>
                      </td>
                      <td className="p-2 text-xs opacity-80">
                        {source.last_scan_at
                          ? t("lastScan", {
                              date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                              status: source.last_scan_status ?? "?",
                            })
                          : t("neverScanned")}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => act(() => adminApi.scanSource(source.id), t("scanStarted", { name: source.name }))}
                          disabled={scan.busy || source.scan_in_progress}
                        >
                          {source.scan_in_progress && <Spinner aria-hidden />}
                          {source.scan_in_progress ? t("scanning") : t("scanNow")}
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {query.data && filtered && shownCount === 0 && <p className="mt-3 text-sm opacity-70">{t("list.noMatch")}</p>}

      <Pagination page={currentPage} pages={pages} onPage={setPage} />
    </main>
  );
}
