"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/pipelines/shared";
import {
  type CustomDate,
  type PipelineStatus,
  type PipelineStep,
  type StepResult,
  daysUntil,
  stepLabel,
  todaySeoul,
} from "@/lib/api/pipelines";
import { useStepAutosave } from "@/lib/use-step-autosave";

const SUBMITTED = "submitted"; // the seeded status key the server dates (submitted_on)

/**
 * Name, number, subject, type, status, IRB result, dates and note of one step; read-only when
 * the step or pipeline is removed. After a result the page offers a matching status (owner:
 * offered, never set by itself).
 */
export function StepHeader({
  pipelineId,
  step,
  statuses,
  readOnly,
  results = [],
  suggestedStatus = null,
  missingRequired = [],
}: {
  pipelineId: number;
  step: PipelineStep;
  statuses: PipelineStatus[];
  readOnly: boolean;
  results?: StepResult[];
  suggestedStatus?: string | null;
  missingRequired?: string[]; // required documents not final and not marked not needed (phase C1)
}) {
  const t = useTranslations("pipelines");
  const save = useStepAutosave(pipelineId, step.id, step, (e) => errorText(e, t));
  const initial = {
    note: step.note,
    name: step.name,
    subject: step.subject ?? "",
    number: step.sequence_no ? String(step.sequence_no) : "",
  };
  const [note, setNote] = useState(initial.note);
  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [number, setNumber] = useState(initial.number);
  const [numberError, setNumberError] = useState(false);
  const [customs, setCustoms] = useState<CustomDate[]>(step.custom_dates ?? []);
  // The memo grows with its text: the whole memo is always shown, never a scroll bar.
  const noteBox = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const box = noteBox.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [note]);
  // What is shown is the user's latest pick until the server's copy has caught up.
  const statusKey = save.value("status_key", step.status_key) ?? step.status_key;
  const resultKey = save.value("result_key", step.result_key) ?? null;
  const dates = {
    due_on: save.value("due_on", step.due_on) ?? null,
    submitted_on: save.value("submitted_on", step.submitted_on) ?? null,
    decided_on: save.value("decided_on", step.decided_on) ?? null,
  };
  const status = statuses.find((s) => s.key === statusKey);
  const choices = statuses.filter((s) => !s.archived || s.key === statusKey);
  const resultChoices = results.filter((r) => !r.archived || r.key === resultKey);
  const suggested = suggestedStatus ? statuses.find((s) => s.key === suggestedStatus) : undefined;
  const due = dates.due_on && !status?.closed ? daysUntil(dates.due_on, todaySeoul()) : null;
  const typeNumber = (digits: string) => {
    setNumber(digits);
    const value = digits.trim() === "" ? null : Number(digits);
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 999)) return setNumberError(true);
    setNumberError(false);
    if (value !== (step.sequence_no ?? null)) save.type({ sequence_no: value });
  };
  const resetTyped = () => {
    setNote(initial.note);
    setName(initial.name);
    setSubject(initial.subject);
    setNumber(initial.number);
    setNumberError(false);
    setCustoms(step.custom_dates ?? []);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? (
          <h1 className="text-2xl font-semibold">{stepLabel(step)}</h1>
        ) : (
          <>
            <h1 className="sr-only">{stepLabel(step)}</h1>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">{t("stepNumber")}</span>
              <input
                aria-label={t("stepNumber")}
                inputMode="numeric"
                className="w-14 rounded border px-2 py-1 text-right text-xl font-semibold"
                value={number}
                placeholder="–"
                onChange={(e) => typeNumber(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={save.flush}
              />
              <span className="text-xl font-semibold">{t("round")}</span>
            </label>
            <label className="sr-only" htmlFor="step-name">
              {t("stepName")}
            </label>
            <input
              id="step-name"
              className="min-w-40 flex-1 rounded border px-2 py-1 text-xl font-semibold"
              value={name}
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim() && e.target.value.trim() !== step.name) save.type({ name: e.target.value.trim() });
              }}
              onBlur={save.flush}
            />
          </>
        )}
        {step.step_type_name && step.step_type_name !== step.name && (
          <span className="text-xs opacity-60">{step.step_type_name}</span>
        )}
        <DueBadge due={due} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {t("subject")}
        <input
          className="rounded border px-2 py-1"
          disabled={readOnly}
          value={subject}
          maxLength={200}
          placeholder={t("subjectHint")}
          onChange={(e) => {
            setSubject(e.target.value);
            if (e.target.value.trim() !== (step.subject ?? "")) save.type({ subject: e.target.value.trim() });
          }}
          onBlur={save.flush}
        />
      </label>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          {t("result")}
          <select
            className="rounded border px-2 py-1"
            disabled={readOnly}
            value={resultKey ?? ""}
            onChange={(e) => save.pick({ result_key: e.target.value || null })}
          >
            <option value="">{t("noResult")}</option>
            {resultChoices.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {!readOnly && suggested && (
          <div className="flex items-end">
            <Button size="sm" variant="outline" onClick={() => save.pick({ status_key: suggested.key })}>
              {t("setStatusTo", { status: suggested.label })}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          {t("status")}
          <select
            className="rounded border px-2 py-1"
            disabled={readOnly}
            value={statusKey}
            onChange={(e) => {
              const next = e.target.value;
              // Phase C1 (D17): submitting with required documents not done is allowed, after a confirmation.
              if (next === SUBMITTED && missingRequired.length > 0 && !window.confirm(t("confirmSubmitMissing", { names: missingRequired.join(", ") })))
                return;
              save.pick({ status_key: next });
            }}
          >
            {choices.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {(["due_on", "submitted_on", "decided_on"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1">
            {t(key)}
            <input
              type="date"
              className="rounded border px-2 py-1"
              disabled={readOnly}
              value={dates[key] ?? ""}
              onChange={(e) => save.pick({ [key]: e.target.value || null })}
            />
          </label>
        ))}
      </div>

      <CustomDates
        value={customs}
        readOnly={readOnly}
        onChange={(next, how) => {
          setCustoms(next);
          const body = { custom_dates: next.filter((d) => d.label.trim()) };
          if (how === "pick") save.pick(body);
          else save.type(body);
        }}
        onBlur={save.flush}
      />

      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="step-note">{t("note")}</label>
        <textarea
          id="step-note"
          ref={noteBox}
          className="resize-none overflow-hidden rounded border px-2 py-1"
          rows={2}
          maxLength={4000}
          disabled={readOnly}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (e.target.value !== step.note) save.type({ note: e.target.value });
          }}
          onBlur={save.flush}
        />
      </div>
      {numberError && (
        <p role="alert" className="text-sm text-red-600">
          {t("numberRange")}
        </p>
      )}
      {!readOnly && <SaveStatus save={save} resetTyped={resetTyped} />}
    </section>
  );
}

const MAX_CUSTOM_DATES = 10; // the server's limit too

/**
 * The step's own named dates (owner, 2026-11-18). A name is typed (saved after a pause), a day is
 * picked (saved at once). A row without a name is not sent: it is a row still being filled in.
 */
function CustomDates({
  value,
  readOnly,
  onChange,
  onBlur,
}: {
  value: CustomDate[];
  readOnly: boolean;
  onChange: (next: CustomDate[], how: "pick" | "type") => void;
  onBlur: () => void;
}) {
  const t = useTranslations("pipelines");
  if (readOnly && value.length === 0) return null;
  const edit = (index: number, change: Partial<CustomDate>, how: "pick" | "type") =>
    onChange(value.map((d, i) => (i === index ? { ...d, ...change } : d)), how);
  return (
    <section className="flex flex-col gap-2 text-sm" aria-label={t("customDates")}>
      <h2 className="opacity-70">{t("customDates")}</h2>
      {value.map((d, i) => (
        <div key={d.id || `new-${i}`} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={t("customDateName")}
            className="min-w-40 flex-1 rounded border px-2 py-1"
            disabled={readOnly}
            maxLength={60}
            placeholder={t("customDateName")}
            value={d.label}
            onChange={(e) => edit(i, { label: e.target.value }, "type")}
            onBlur={onBlur}
          />
          <input
            type="date"
            aria-label={d.label || t("customDateDay")}
            className="rounded border px-2 py-1"
            disabled={readOnly}
            value={d.day ?? ""}
            onChange={(e) => edit(i, { day: e.target.value || null }, "pick")}
          />
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i), "pick")}>
              {t("customDateRemove")}
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={value.length >= MAX_CUSTOM_DATES}
            onClick={() => onChange([...value, { id: "", label: "", day: null }], "type")}
          >
            {t("customDateAdd")}
          </Button>
          <span className="text-xs opacity-60">{value.length >= MAX_CUSTOM_DATES ? t("customDateMax") : t("customDateHint")}</span>
        </div>
      )}
    </section>
  );
}

/** Saving, saved, or not saved with the reason, a retry and a way to drop the unsaved values. A
 * failed save never looks like no change. */
function SaveStatus({
  save,
  resetTyped,
}: {
  save: ReturnType<typeof useStepAutosave>;
  resetTyped: () => void;
}) {
  const t = useTranslations("pipelines");
  if (save.phase === "saving") {
    return (
      <p role="status" className="text-xs opacity-70">
        {t("autoSaving")}
      </p>
    );
  }
  if (save.phase === "saved") {
    return (
      <p role="status" className="text-xs text-green-700 dark:text-green-400">
        {t("autoSaved")}
      </p>
    );
  }
  if (save.phase === "failed") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-600">
        <span>{t("autoNotSaved", { reason: save.error ?? "" })}</span>
        <Button size="sm" variant="outline" onClick={save.flush}>
          {t("autoRetry")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => save.discard(resetTyped)}>
          {t("autoDiscard")}
        </Button>
      </div>
    );
  }
  return null;
}

/** "3 days overdue" / "due in 5 days"; nothing without a due date or for a closed step. */
export function DueBadge({ due }: { due: number | null }) {
  const t = useTranslations("pipelines");
  if (due === null) return null;
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${due < 0 ? "bg-red-100 text-red-800" : due <= 14 ? "bg-amber-100 text-amber-800" : "bg-neutral-100"}`}>
      {due < 0 ? t("overdue", { n: -due }) : t("dueIn", { n: due })}
    </span>
  );
}
