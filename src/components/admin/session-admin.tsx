"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Inbox, Sparkles, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AllSearch } from "@/components/admin/all-search";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { SessionFacts, SessionForm, emptySession, fromSession, toInput } from "@/components/calendar/session-parts";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api/admin";
import { type IrbSession, type SessionJob, type SessionKind, type SessionState, addDays, sessionApi } from "@/lib/api/calendar";
import { todaySeoul } from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

export const SESSIONS_KEY = ["admin", "sessions"] as const;
const JOB_POLL_MS = 4000;

type Message = { kind: "ok" | "error"; text: string } | null;

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
      {message.text}
    </p>
  );
}

/** One change at a time with its message; afterwards the session lists load again. */
function useRun() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  async function run(work: () => Promise<unknown>, ok: string, after?: () => void) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        after?.();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      } finally {
        await queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
        await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      }
    });
  }
  return { run, busy: flight.busy, message };
}

/**
 * IRB review sessions (CAL-1), platform-wide: every organization sees the same rows. Review
 * proposals from users and the AI; enter, change, cancel and remove sessions per hospital;
 * start the AI search that reads a hospital's stored posts (it writes proposals only); edit the
 * list of review kinds.
 */
export function SessionAdmin() {
  const t = useTranslations("admin");
  const ts = useTranslations("sessions");
  const kinds = useQuery({ queryKey: [...SESSIONS_KEY, "kinds"], queryFn: () => sessionApi.kinds(true) });
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const names = new Map((hospitals.data?.hospitals ?? []).map((h) => [h.id, h.name]));
  const [hospitalId, setHospitalId] = useState<number | null>(null);
  const chosen = hospitalId ?? hospitals.data?.hospitals[0]?.id ?? null;
  const allKinds = kinds.data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("sessions.title")}</h1>
        <p className="text-sm opacity-70">{t("sessions.intro")}</p>
      </header>
      {(kinds.isError || hospitals.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(kinds.error ?? hospitals.error, t)}
        </p>
      )}
      <Proposals kinds={allKinds} names={names} />
      <Section icon={CalendarClock} accent="blue" title={t("sessions.perHospital")}>
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          {ts("hospital")}
          <select className="rounded border px-2 py-1" value={chosen ?? ""} onChange={(e) => setHospitalId(Number(e.target.value))}>
            {(hospitals.data?.hospitals ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {chosen !== null && <HospitalSessions key={chosen} hospitalId={chosen} kinds={allKinds} />}
      </Section>
      {chosen !== null && <FindSessions key={`find-${chosen}`} hospitalId={chosen} name={names.get(chosen) ?? ""} />}
      {chosen !== null && <AllSearch key={`all-${chosen}`} hospitalId={chosen} name={names.get(chosen) ?? ""} />}
      <KindEditor kinds={allKinds} />
    </main>
  );
}

function Proposals({ kinds, names }: { kinds: SessionKind[]; names: Map<number, string> }) {
  const t = useTranslations("admin");
  const list = useQuery({ queryKey: [...SESSIONS_KEY, "proposals"], queryFn: sessionApi.proposals });
  const { run, busy, message } = useRun();
  const move = (s: IrbSession, state: SessionState, ok: string) => run(() => sessionApi.update(s.id, { state }), ok);
  const rows = list.data ?? [];
  return (
    <Section icon={Inbox} accent="amber" title={t("sessions.proposals", { n: rows.length })}>
      {list.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(list.error, t)}
        </p>
      )}
      {list.data && rows.length === 0 && <p className="text-sm opacity-70">{t("sessions.noProposals")}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded border border-dashed p-3">
            <SessionFacts session={s} kinds={kinds} hospital={names.get(s.hospital_id)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void move(s, "confirmed", t("sessions.confirmed"))}>
                {t("sessions.confirm")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(s, "tentative", t("sessions.approved"))}>
                {t("sessions.approveTentative")}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void move(s, "rejected", t("sessions.rejected"))}>
                {t("sessions.reject")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Note message={message} />
    </Section>
  );
}

function HospitalSessions({ hospitalId, kinds }: { hospitalId: number; kinds: SessionKind[] }) {
  const t = useTranslations("admin");
  const ts = useTranslations("sessions");
  const today = todaySeoul();
  const list = useQuery({
    queryKey: [...SESSIONS_KEY, "hospital", hospitalId],
    queryFn: () => sessionApi.forHospital(hospitalId, addDays(today, -30), addDays(today, 400)),
  });
  const { run, busy, message } = useRun();
  const [adding, setAdding] = useState(false);
  const [state, setState] = useState<"tentative" | "confirmed">("confirmed");
  const [editing, setEditing] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const rows = (list.data ?? []).filter((s) => showRejected || s.state !== "rejected");
  return (
    <div className="flex flex-col gap-3">
      {list.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(list.error, t)}
        </p>
      )}
      {list.data && rows.length === 0 && <p className="text-sm opacity-70">{t("sessions.none")}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((s) => (
          <li key={s.id} className={`flex flex-col gap-2 rounded border p-3 ${s.state === "proposed" ? "border-dashed" : ""}`}>
            {editing === s.id ? (
              <SessionForm
                kinds={kinds}
                initial={fromSession(s)}
                submitLabel={t("save")}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSubmit={(v) => void run(() => sessionApi.update(s.id, toInput(v)), t("saved"), () => setEditing(null))}
              />
            ) : (
              <SessionFacts session={s} kinds={kinds} />
            )}
            {editing !== s.id && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(s.id)}>
                  {t("sessions.edit")}
                </Button>
                {nextStates(s.state).map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => sessionApi.update(s.id, { state: next }), t("saved"))}
                  >
                    {ts(`to.${next}`)}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => sessionApi.remove(s.id), t("sessions.removed"))}>
                  {t("sessions.remove")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />
        {t("sessions.showRejected")}
      </label>
      <div>
        <Button size="sm" variant="outline" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          {t("sessions.add")}
        </Button>
      </div>
      {adding && (
        <SessionForm
          kinds={kinds}
          initial={emptySession(kinds)}
          submitLabel={t("sessions.add")}
          busy={busy}
          onCancel={() => setAdding(false)}
          extra={
            <label className="flex flex-col gap-1">
              {ts("stateLabel")}
              <select className="rounded border px-2 py-1" value={state} onChange={(e) => setState(e.target.value as "tentative" | "confirmed")}>
                <option value="confirmed">{ts("state.confirmed")}</option>
                <option value="tentative">{ts("state.tentative")}</option>
              </select>
            </label>
          }
          onSubmit={(v) => void run(() => sessionApi.create(hospitalId, { ...toInput(v), state }), t("sessions.added"), () => setAdding(false))}
        />
      )}
      <Note message={message} />
    </div>
  );
}

/** The state changes offered for a session (the server's rule, services/sessions.py MOVES). */
export function nextStates(state: SessionState): SessionState[] {
  const moves: Record<SessionState, SessionState[]> = {
    proposed: ["confirmed", "tentative", "rejected"],
    tentative: ["confirmed", "cancelled"],
    confirmed: ["tentative", "cancelled"],
    cancelled: ["tentative"],
    rejected: ["tentative", "confirmed"],
  };
  return moves[state];
}

function FindSessions({ hospitalId, name }: { hospitalId: number; name: string }) {
  const t = useTranslations("admin");
  const finder = useQuery({ queryKey: [...SESSIONS_KEY, "finder"], queryFn: sessionApi.finder });
  const jobs = useQuery({
    queryKey: [...SESSIONS_KEY, "jobs", hospitalId],
    queryFn: () => sessionApi.jobs(hospitalId),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "queued" || j.status === "running") ? JOB_POLL_MS : false),
  });
  const queryClient = useQueryClient();
  const { run, busy, message } = useRun();
  const open = jobs.data?.some((j) => j.status === "queued" || j.status === "running") ?? false;
  const enabled = finder.data?.enabled ?? false;
  return (
    <Section icon={Sparkles} accent="violet" title={t("sessions.findTitle", { name })}>
      <p className="text-sm opacity-80">{t("sessions.findIntro")}</p>
      {finder.data && !enabled && <p className="text-sm text-amber-700 dark:text-amber-300">{t("sessions.findOff")}</p>}
      <div>
        <Button
          size="sm"
          disabled={!enabled || busy || open}
          onClick={() =>
            void run(() => sessionApi.find(hospitalId), t("sessions.findStarted"), () =>
              void queryClient.invalidateQueries({ queryKey: [...SESSIONS_KEY, "jobs", hospitalId] }),
            )
          }
        >
          {open ? t("sessions.finding") : t("sessions.find")}
        </Button>
      </div>
      <Note message={message} />
      {jobs.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(jobs.error, t)}
        </p>
      )}
      {(jobs.data ?? []).length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {(jobs.data ?? []).slice(0, 5).map((j) => (
            <JobLine key={j.id} job={j} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function JobLine({ job }: { job: SessionJob }) {
  const t = useTranslations("admin");
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums opacity-70">{job.created_at.slice(0, 16).replace("T", " ")}</span>
      <span className={`rounded px-2 py-0.5 text-xs ${job.status === "failed" ? "bg-red-100 text-red-800" : job.status === "done" ? "bg-emerald-100 text-emerald-900" : "bg-sky-100 text-sky-900"}`}>
        {t(`sessions.job.${job.status}`)}
      </span>
      {job.status === "done" && (
        <span>{t("sessions.jobCounts", { read: job.documents_read, proposed: job.proposed, skipped: job.skipped })}</span>
      )}
      {job.status === "failed" && job.error && <span className="text-red-700">{job.error}</span>}
    </li>
  );
}

function KindEditor({ kinds }: { kinds: SessionKind[] }) {
  const t = useTranslations("admin");
  const { run, busy, message } = useRun();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <Section icon={Tags} accent="slate" title={t("sessions.kinds")}>
      <ul className="flex flex-col gap-2 text-sm">
        {kinds.map((k) => (
          <li key={k.key} className={`flex flex-wrap items-center gap-2 ${k.archived_at ? "opacity-60" : ""}`}>
            <code className="text-xs">{k.key}</code>
            <input
              aria-label={t("sessions.kindLabel")}
              className="rounded border px-2 py-1"
              maxLength={60}
              value={names[k.key] ?? k.label}
              onChange={(e) => setNames({ ...names, [k.key]: e.target.value })}
              onBlur={() => {
                const v = (names[k.key] ?? k.label).trim();
                if (v && v !== k.label) void run(() => sessionApi.updateKind(k.key, { label: v }), t("saved"));
              }}
            />
            {k.key !== "other" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => sessionApi.updateKind(k.key, { archived: !k.archived_at }), t("saved"))}
              >
                {k.archived_at ? t("sessions.unarchive") : t("sessions.archive")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim() && label.trim())
            void run(() => sessionApi.addKind(key.trim(), label.trim()), t("sessions.kindAdded"), () => {
              setKey("");
              setLabel("");
            });
        }}
      >
        <label className="flex flex-col gap-1">
          {t("sessions.kindKey")}
          <input className="rounded border px-2 py-1" pattern="[a-z][a-z0-9_]{0,39}" value={key} onChange={(e) => setKey(e.target.value)} placeholder="special" />
        </label>
        <label className="flex flex-col gap-1">
          {t("sessions.kindLabel")}
          <input className="rounded border px-2 py-1" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t("sessions.addKind")}
        </Button>
      </form>
      <Note message={message} />
    </Section>
  );
}
