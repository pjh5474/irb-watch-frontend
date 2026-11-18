"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SessionFacts, SessionForm, emptySession, toInput } from "@/components/calendar/session-parts";
import { errorText } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  ALL_TYPES,
  type CalendarData,
  type CalendarFilter,
  type CalendarItem,
  type CalendarMode,
  calendarApi,
  filterItems,
  itemHref,
  monthGrid,
  sessionApi,
  step,
  timeLabel,
  viewRange,
  weekDays,
} from "@/lib/api/calendar";
import { todaySeoul } from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

const MAX_IN_CELL = 4;

const TYPE_STYLE: Record<CalendarItem["type"], string> = {
  session_cutoff: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  session_meeting: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  step_due: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  step_submitted: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
  step_decided: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
  task: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
};

/**
 * The IRB calendar (CAL-1): step dates, hospital IRB sessions (meeting and cutoff) and project
 * tasks over the projects the user works on. Month, week and list views; filters by project,
 * site, hospital, kind and type. A failed load shows its reason, never an empty calendar.
 */
export function CalendarView() {
  const t = useTranslations("calendar");
  const tp = useTranslations("pipelines");
  const today = todaySeoul();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState<CalendarFilter>({
    projectId: null,
    siteId: null,
    hospitalId: null,
    types: ALL_TYPES,
    kindKey: null,
    hideDone: false,
  });
  const [openSession, setOpenSession] = useState<CalendarItem | null>(null);
  const [proposing, setProposing] = useState(false);
  const range = viewRange(mode, day);
  const data = useQuery({
    queryKey: ["calendar", range.start, range.end],
    queryFn: () => calendarApi.get(range.start, range.end),
    // Moving to another month keeps the filters and the old items on screen until the new ones come.
    placeholderData: keepPreviousData,
  });
  const items = useMemo(
    () => (data.data ? filterItems(data.data.items, filter, data.data) : []),
    [data.data, filter],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        <div role="tablist" aria-label={t("view")} className="flex gap-1 text-sm">
          {(["month", "week", "list"] as const).map((m) => (
            <Button key={m} size="sm" role="tab" aria-selected={mode === m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
              {t(`modes.${m}`)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" aria-label={t("previous")} onClick={() => setDay(step(mode, day, -1))}>
            ‹
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDay(today)}>
            {t("today")}
          </Button>
          <Button size="sm" variant="outline" aria-label={t("next")} onClick={() => setDay(step(mode, day, 1))}>
            ›
          </Button>
        </div>
        <Button size="sm" onClick={() => setProposing((v) => !v)} aria-expanded={proposing}>
          {t("propose")}
        </Button>
      </header>
      <p className="text-sm font-medium" aria-live="polite">
        <RangeTitle mode={mode} day={day} start={range.start} end={range.end} />
      </p>

      {data.data && proposing && <ProposeSession data={data.data} onDone={() => setProposing(false)} />}
      {data.data && <Filters data={data.data} filter={filter} setFilter={setFilter} />}

      {data.isLoading && <p className="text-sm opacity-70">{tp("loading")}</p>}
      {data.isError && (
        <p role="alert" className="text-sm text-red-600">
          {t("loadFailed", { reason: errorText(data.error, tp) })}
        </p>
      )}

      {data.data && openSession && (
        <SessionPanel item={openSession} data={data.data} onClose={() => setOpenSession(null)} />
      )}

      {data.data && (
        <>
          {mode === "month" && <MonthView day={day} today={today} items={items} onSession={setOpenSession} onDay={(d) => { setDay(d); setMode("list"); }} />}
          {mode === "week" && <WeekView day={day} today={today} items={items} onSession={setOpenSession} />}
          {mode === "list" && <ListView items={items} today={today} onSession={setOpenSession} />}
          {items.length === 0 && <p className="text-sm opacity-70">{t("nothing")}</p>}
          <Legend />
        </>
      )}
    </main>
  );
}

function RangeTitle({ mode, day, start, end }: { mode: CalendarMode; day: string; start: string; end: string }) {
  const locale = useLocale();
  if (mode === "month") {
    const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
    return <>{new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(d)}</>;
  }
  return (
    <>
      {start} – {end}
    </>
  );
}

function weekdayNames(locale: string): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
}

function Filters({
  data,
  filter,
  setFilter,
}: {
  data: CalendarData;
  filter: CalendarFilter;
  setFilter: (f: CalendarFilter) => void;
}) {
  const t = useTranslations("calendar");
  const num = (v: string) => (v === "" ? null : Number(v));
  const toggle = (g: "steps" | "sessions" | "tasks") => {
    const next = new Set(filter.types);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setFilter({ ...filter, types: next });
  };
  const sites = Object.entries(data.sites).filter(([, s]) => s.label);
  return (
    <section aria-label={t("filters")} className="flex flex-wrap items-end gap-3 rounded border p-3 text-sm">
      <label className="flex flex-col gap-1">
        {t("project")}
        <select className="rounded border px-2 py-1" value={filter.projectId ?? ""} onChange={(e) => setFilter({ ...filter, projectId: num(e.target.value), siteId: null })}>
          <option value="">{t("all")}</option>
          {Object.entries(data.projects).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {sites.length > 0 && (
        <label className="flex flex-col gap-1">
          {t("site")}
          <select className="rounded border px-2 py-1" value={filter.siteId ?? ""} onChange={(e) => setFilter({ ...filter, siteId: num(e.target.value) })}>
            <option value="">{t("all")}</option>
            {sites.map(([id, s]) => (
              <option key={id} value={id}>
                {s.label} · {data.hospitals[String(s.hospital_id)] ?? ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        {t("hospital")}
        <select className="rounded border px-2 py-1" value={filter.hospitalId ?? ""} onChange={(e) => setFilter({ ...filter, hospitalId: num(e.target.value) })}>
          <option value="">{t("all")}</option>
          {Object.entries(data.hospitals).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        {t("kind")}
        <select className="rounded border px-2 py-1" value={filter.kindKey ?? ""} onChange={(e) => setFilter({ ...filter, kindKey: e.target.value || null })}>
          <option value="">{t("all")}</option>
          {data.kinds.filter((k) => !k.archived_at).map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">{t("types")}</legend>
        {(["steps", "sessions", "tasks"] as const).map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input type="checkbox" checked={filter.types.has(g)} onChange={() => toggle(g)} />
            {t(`groups.${g}`)}
          </label>
        ))}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={filter.hideDone} onChange={(e) => setFilter({ ...filter, hideDone: e.target.checked })} />
          {t("hideDone")}
        </label>
      </fieldset>
    </section>
  );
}

/** One item as a small chip: opens its step or project page, or the session's panel. */
function Chip({ item, onSession, full = false }: { item: CalendarItem; onSession: (i: CalendarItem) => void; full?: boolean }) {
  const t = useTranslations("calendar");
  const proposed = item.session_state === "proposed";
  const cancelled = item.session_state === "cancelled";
  const faded = item.done || (item.type.startsWith("step_") && item.closed);
  const sessionItem = item.type.startsWith("session_");
  const label = (
    <>
      {item.time && <span className="mr-1 tabular-nums">{timeLabel(item.time)}</span>}
      {sessionItem && item.hospital_name && <span className="mr-1 font-semibold">{item.hospital_name}</span>}
      <span className="font-medium">{t(`types_short.${item.type}`)}</span> {item.title}
      {proposed && <span className="ml-1">({t("notConfirmed")})</span>}
      {full && (
        <span className="ml-1 opacity-70">
          {[item.project_name, sessionItem ? null : item.hospital_name, item.site_label].filter(Boolean).join(" · ")}
        </span>
      )}
    </>
  );
  const cls = `block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${TYPE_STYLE[item.type]} ${proposed ? "border border-dashed border-current" : ""} ${cancelled || item.done ? "line-through" : ""} ${faded ? "opacity-60" : ""}`;
  const title = [t(`types_long.${item.type}`), item.title, item.project_name, item.hospital_name, item.site_label]
    .filter(Boolean)
    .join(" · ");
  if (item.session_id !== null)
    return (
      <button type="button" className={cls} title={title} onClick={() => onSession(item)}>
        {label}
      </button>
    );
  const href = itemHref(item);
  return href ? (
    <Link href={href} className={cls} title={title}>
      {label}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {label}
    </span>
  );
}

function byDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const out = new Map<string, CalendarItem[]>();
  for (const i of items) out.set(i.date, [...(out.get(i.date) ?? []), i]);
  return out;
}

function MonthView({
  day,
  today,
  items,
  onSession,
  onDay,
}: {
  day: string;
  today: string;
  items: CalendarItem[];
  onSession: (i: CalendarItem) => void;
  onDay: (d: string) => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const days = monthGrid(day);
  const month = day.slice(0, 7);
  const grouped = byDay(items);
  return (
    <div role="grid" aria-label={t("modes.month")} className="grid grid-cols-7 gap-px overflow-hidden rounded border bg-neutral-200 text-sm dark:bg-neutral-800">
      {weekdayNames(locale).map((name) => (
        <div key={name} role="columnheader" className="bg-white px-2 py-1 text-xs font-medium opacity-70 dark:bg-neutral-950">
          {name}
        </div>
      ))}
      {days.map((d) => {
        const list = grouped.get(d) ?? [];
        return (
          <div
            key={d}
            role="gridcell"
            aria-label={d}
            className={`flex min-h-24 flex-col gap-0.5 bg-white p-1 dark:bg-neutral-950 ${d.slice(0, 7) !== month ? "opacity-50" : ""}`}
          >
            <span className={`self-start rounded px-1 text-xs ${d === today ? "bg-neutral-900 font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900" : ""}`}>
              {Number(d.slice(8))}
            </span>
            {list.slice(0, MAX_IN_CELL).map((i, n) => (
              <Chip key={`${i.type}-${i.step_id ?? i.session_id ?? i.task_id}-${n}`} item={i} onSession={onSession} />
            ))}
            {list.length > MAX_IN_CELL && (
              <button type="button" className="text-left text-xs underline opacity-70" onClick={() => onDay(d)}>
                {t("more", { n: list.length - MAX_IN_CELL })}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ day, today, items, onSession }: { day: string; today: string; items: CalendarItem[]; onSession: (i: CalendarItem) => void }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const names = weekdayNames(locale);
  const grouped = byDay(items);
  return (
    <div aria-label={t("modes.week")} className="grid gap-2 sm:grid-cols-7">
      {weekDays(day).map((d, n) => (
        <section key={d} aria-label={d} className={`flex min-h-40 flex-col gap-1 rounded border p-2 ${d === today ? "border-neutral-900 dark:border-neutral-100" : ""}`}>
          <h2 className="text-xs font-medium">
            {names[n]} {d.slice(5)}
          </h2>
          {(grouped.get(d) ?? []).map((i, k) => (
            <Chip key={`${i.type}-${i.step_id ?? i.session_id ?? i.task_id}-${k}`} item={i} onSession={onSession} full />
          ))}
        </section>
      ))}
    </div>
  );
}

function ListView({ items, today, onSession }: { items: CalendarItem[]; today: string; onSession: (i: CalendarItem) => void }) {
  const t = useTranslations("calendar");
  const grouped = [...byDay(items).entries()];
  return (
    <ol aria-label={t("modes.list")} className="flex flex-col gap-3">
      {grouped.map(([d, list]) => (
        <li key={d} className="flex flex-col gap-1">
          <h2 className={`text-sm font-medium ${d === today ? "underline" : ""}`}>
            {d}
            {d === today ? ` · ${t("today")}` : ""}
          </h2>
          <ul className="flex flex-col gap-1">
            {list.map((i, k) => (
              <li key={`${i.type}-${i.step_id ?? i.session_id ?? i.task_id}-${k}`}>
                <Chip item={i} onSession={onSession} full />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Legend() {
  const t = useTranslations("calendar");
  return (
    <ul aria-label={t("legend")} className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(TYPE_STYLE) as CalendarItem["type"][]).map((type) => (
        <li key={type} className={`rounded px-1.5 py-0.5 ${TYPE_STYLE[type]}`}>
          {t(`types_long.${type}`)}
        </li>
      ))}
      <li className="rounded border border-dashed px-1.5 py-0.5">{t("legendProposed")}</li>
    </ul>
  );
}

/** A session's details, the user's steps aiming for it, and "Withdraw" for one's own proposal. */
function SessionPanel({ item, data, onClose }: { item: CalendarItem; data: CalendarData; onClose: () => void }) {
  const t = useTranslations("calendar");
  const tp = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const hospitalId = item.hospital_id ?? 0;
  // The session itself (the calendar item carries only what the grid needs). Its meeting or its
  // cutoff falls on the item's day, so that one day finds it.
  const sessions = useQuery({
    queryKey: ["sessions", "hospital", hospitalId, item.date],
    queryFn: () => sessionApi.forHospital(hospitalId, item.date, item.date),
  });
  const session = sessions.data?.find((s) => s.id === item.session_id);
  const steps = data.items.filter((i) => i.type.startsWith("step_") && i.step_id !== null && item.target_step_ids.includes(i.step_id));
  const uniqueSteps = [...new Map(steps.map((s) => [s.step_id, s])).values()];
  async function withdraw(id: number) {
    setError(null);
    await flight.run(async () => {
      try {
        await sessionApi.withdraw(id);
        await queryClient.invalidateQueries({ queryKey: ["calendar"] });
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        onClose();
      } catch (e) {
        setError(errorText(e, tp));
      }
    });
  }
  return (
    <section aria-label={t("sessionDetails")} className="flex flex-col gap-2 rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t("sessionDetails")}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
      {sessions.isLoading && <p className="text-sm opacity-70">{tp("loading")}</p>}
      {sessions.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorText(sessions.error, tp)}
        </p>
      )}
      {sessions.data && !session && <p className="text-sm opacity-70">{t("sessionGone")}</p>}
      {session && <SessionFacts session={session} kinds={data.kinds} hospital={item.hospital_name} />}
      {session?.state === "proposed" && <p className="text-xs text-amber-700 dark:text-amber-300">{t("proposedHint")}</p>}
      {uniqueSteps.length > 0 && (
        <div className="text-sm">
          <h3 className="font-medium">{t("aimingSteps")}</h3>
          <ul className="list-disc pl-5">
            {uniqueSteps.map((s) => (
              <li key={s.step_id}>
                <Link className="underline" href={`/pipelines/${s.pipeline_id}/steps/${s.step_id}`}>
                  {s.title}
                </Link>{" "}
                <span className="opacity-70">{[s.project_name, s.site_label].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {session?.proposed_by_me && session.state === "proposed" && session.origin === "user" && (
        <div>
          <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void withdraw(session.id)}>
            {t("withdraw")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** Propose a session for one of the user's hospitals; an admin reviews it. */
export function ProposeSession({ data, onDone, hospitalId }: { data: Pick<CalendarData, "hospitals" | "kinds">; onDone: () => void; hospitalId?: number }) {
  const t = useTranslations("calendar");
  const tp = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const hospitals = Object.entries(data.hospitals);
  const [hospital, setHospital] = useState(hospitalId ?? (hospitals[0] ? Number(hospitals[0][0]) : 0));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (hospitals.length === 0 && hospitalId === undefined)
    return <p className="rounded border p-3 text-sm opacity-80">{t("noHospitals")}</p>;
  return (
    <section aria-label={t("propose")} className="flex flex-col gap-2 rounded border p-4">
      <h2 className="font-medium">{t("propose")}</h2>
      <p className="text-xs opacity-70">{t("proposeHint")}</p>
      {hospitalId === undefined && (
        <label className="flex flex-col gap-1 text-sm">
          {t("hospital")}
          <select className="rounded border px-2 py-1" value={hospital} onChange={(e) => setHospital(Number(e.target.value))}>
            {hospitals.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <SessionForm
        kinds={data.kinds}
        initial={emptySession(data.kinds)}
        submitLabel={t("sendProposal")}
        busy={flight.busy}
        onCancel={onDone}
        onSubmit={(v) =>
          void flight.run(async () => {
            setMessage(null);
            try {
              await sessionApi.propose(hospital, toInput(v));
              await queryClient.invalidateQueries({ queryKey: ["calendar"] });
              await queryClient.invalidateQueries({ queryKey: ["sessions"] });
              await queryClient.invalidateQueries({ queryKey: ["pipelines"] });
              setMessage({ kind: "ok", text: t("proposalSent") });
            } catch (e) {
              setMessage({ kind: "error", text: errorText(e, tp) });
            }
          })
        }
      />
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
