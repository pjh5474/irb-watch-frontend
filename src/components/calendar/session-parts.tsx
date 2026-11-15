"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { IrbSession, SessionInput, SessionKind, SessionState } from "@/lib/api/calendar";
import { timeLabel } from "@/lib/api/calendar";

// Pieces shared by the calendar, the step page and the admin sessions tab (CAL-1).

const STATE_STYLE: Record<SessionState, string> = {
  proposed: "border border-dashed border-amber-500 text-amber-800 dark:text-amber-300",
  tentative: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  confirmed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  cancelled: "bg-neutral-200 text-neutral-700 line-through dark:bg-neutral-800 dark:text-neutral-300",
  rejected: "bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-200",
};

/** "Proposed, not confirmed" / "Tentative" / "Confirmed" / "Cancelled" / "Rejected". */
export function SessionStateBadge({ state }: { state: SessionState | null }) {
  const t = useTranslations("sessions");
  if (!state) return null;
  return <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[state]}`}>{t(`state.${state}`)}</span>;
}

export const kindLabel = (kinds: SessionKind[], key: string) => kinds.find((k) => k.key === key)?.label ?? key;

/** "2026-12-10 14:00" or "2026-12-10 (time unknown)". */
export function DateTime({ day, time }: { day: string; time: string | null }) {
  const t = useTranslations("sessions");
  return (
    <span>
      {day} {time ? timeLabel(time) : <span className="opacity-60">({t("timeUnknown")})</span>}
    </span>
  );
}

/** A session's facts in a few lines: kind, meeting, cutoff, state, note and evidence. */
export function SessionFacts({ session, kinds, hospital }: { session: IrbSession; kinds: SessionKind[]; hospital?: string | null }) {
  const t = useTranslations("sessions");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="opacity-70">{t("kind")}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {kindLabel(kinds, session.kind_key)}
        {hospital ? <span className="opacity-70">· {hospital}</span> : null}
        <SessionStateBadge state={session.state} />
      </dd>
      <dt className="opacity-70">{t("meeting")}</dt>
      <dd>
        <DateTime day={session.meets_on} time={session.meets_at} />
      </dd>
      <dt className="opacity-70">{t("cutoff")}</dt>
      <dd>{session.cutoff_on ? <DateTime day={session.cutoff_on} time={session.cutoff_at} /> : <span className="opacity-60">{t("noCutoff")}</span>}</dd>
      {session.note && (
        <>
          <dt className="opacity-70">{t("note")}</dt>
          <dd className="whitespace-pre-wrap">{session.note}</dd>
        </>
      )}
      {(session.evidence_url || session.evidence_quote || session.evidence_version_id) && (
        <>
          <dt className="opacity-70">{t("evidence")}</dt>
          <dd className="flex flex-col gap-1">
            {session.evidence_url && (
              <a className="break-all underline" href={session.evidence_url} target="_blank" rel="noopener noreferrer nofollow">
                {session.evidence_url}
              </a>
            )}
            {/* Copied from a hospital post by the AI: untrusted, shown as plain text only. */}
            {session.evidence_quote && <q className="opacity-80">{session.evidence_quote}</q>}
            {session.evidence_version_id && <span className="text-xs opacity-70">{t("fromStoredPost")}</span>}
          </dd>
        </>
      )}
      <dt className="opacity-70">{t("origin")}</dt>
      <dd className="text-xs opacity-80">
        {t(`origins.${session.origin}`)}
        {session.proposed_by ? ` · ${t("proposedBy", { name: session.proposed_by })}` : ""}
        {session.reviewed_by && session.state !== "proposed" ? ` · ${t("reviewedBy", { name: session.reviewed_by })}` : ""}
      </dd>
    </dl>
  );
}

export type SessionFormValue = Required<Pick<SessionInput, "meets_on">> & {
  kind_key: string;
  meets_at: string;
  cutoff_on: string;
  cutoff_at: string;
  note: string;
  evidence_url: string;
};

export const emptySession = (kinds: SessionKind[]): SessionFormValue => ({
  kind_key: kinds.find((k) => !k.archived_at)?.key ?? "other",
  meets_on: "",
  meets_at: "",
  cutoff_on: "",
  cutoff_at: "",
  note: "",
  evidence_url: "",
});

export const fromSession = (s: IrbSession): SessionFormValue => ({
  kind_key: s.kind_key,
  meets_on: s.meets_on,
  meets_at: s.meets_at ? timeLabel(s.meets_at) : "",
  cutoff_on: s.cutoff_on ?? "",
  cutoff_at: s.cutoff_at ? timeLabel(s.cutoff_at) : "",
  note: s.note,
  evidence_url: s.evidence_url ?? "",
});

/** The form's values as the API takes them: empty fields become null (a time stays unknown). */
export function toInput(v: SessionFormValue): SessionInput {
  return {
    kind_key: v.kind_key || null,
    meets_on: v.meets_on,
    meets_at: v.meets_at || null,
    cutoff_on: v.cutoff_on || null,
    cutoff_at: v.cutoff_on && v.cutoff_at ? v.cutoff_at : null,
    note: v.note.trim(),
    evidence_url: v.evidence_url.trim() || null,
  };
}

/** The local checks before sending (the server checks again). Returns a message key or null. */
export function sessionProblem(v: SessionFormValue): string | null {
  if (!v.meets_on) return "needMeeting";
  if (v.cutoff_on && v.cutoff_on > v.meets_on) return "cutoffAfterMeeting";
  if (v.cutoff_at && !v.cutoff_on) return "cutoffTimeNeedsDate";
  if (v.evidence_url.trim() && !/^https?:\/\/\S+$/i.test(v.evidence_url.trim())) return "badLink";
  return null;
}

/** The fields of a session: kind, meeting date and optional time, cutoff, note, link. */
export function SessionForm({
  kinds,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  extra,
}: {
  kinds: SessionKind[];
  initial: SessionFormValue;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: SessionFormValue) => void;
  onCancel?: () => void;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("sessions");
  const [v, setV] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (k: keyof SessionFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((old) => ({ ...old, [k]: e.target.value }));
  const live = kinds.filter((k) => !k.archived_at || k.key === v.kind_key);
  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const p = sessionProblem(v);
        setProblem(p);
        if (!p) onSubmit(v);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          {t("kind")}
          <select className="rounded border px-2 py-1" value={v.kind_key} onChange={set("kind_key")}>
            {live.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("meetingDate")}
          <input type="date" required className="rounded border px-2 py-1" value={v.meets_on} onChange={set("meets_on")} />
        </label>
        <label className="flex flex-col gap-1">
          {t("meetingTime")}
          <input type="time" className="rounded border px-2 py-1" value={v.meets_at} onChange={set("meets_at")} />
        </label>
        <label className="flex flex-col gap-1">
          {t("cutoffDate")}
          <input type="date" className="rounded border px-2 py-1" value={v.cutoff_on} onChange={set("cutoff_on")} />
        </label>
        <label className="flex flex-col gap-1">
          {t("cutoffTime")}
          <input type="time" className="rounded border px-2 py-1" value={v.cutoff_at} onChange={set("cutoff_at")} disabled={!v.cutoff_on} />
        </label>
        {extra}
      </div>
      <p className="text-xs opacity-70">{t("timeHint")}</p>
      <label className="flex flex-col gap-1">
        {t("evidenceLink")}
        <input
          type="url"
          className="rounded border px-2 py-1"
          value={v.evidence_url}
          maxLength={1000}
          placeholder="https://"
          onChange={set("evidence_url")}
        />
      </label>
      <label className="flex flex-col gap-1">
        {t("note")}
        <textarea className="rounded border px-2 py-1" rows={2} maxLength={2000} value={v.note} onChange={set("note")} />
      </label>
      {problem && (
        <p role="alert" className="text-sm text-red-600">
          {t(`problems.${problem}`)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
