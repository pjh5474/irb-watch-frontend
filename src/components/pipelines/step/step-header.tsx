"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Note, useChange } from "@/components/pipelines/shared";
import { type PipelineStatus, type PipelineStep, type StepChange, daysUntil, pipelineApi, todaySeoul } from "@/lib/api/pipelines";

/** Name, type, status, dates and note of one step; read-only when the step or pipeline is removed. */
export function StepHeader({
  pipelineId,
  step,
  statuses,
  readOnly,
}: {
  pipelineId: number;
  step: PipelineStep;
  statuses: PipelineStatus[];
  readOnly: boolean;
}) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [note, setNote] = useState(step.note);
  const [name, setName] = useState(step.name);
  const status = statuses.find((s) => s.key === step.status_key);
  const choices = statuses.filter((s) => !s.archived || s.key === step.status_key);
  const due = step.due_on && !status?.closed ? daysUntil(step.due_on, todaySeoul()) : null;
  const update = (c: StepChange) => change.run(() => pipelineApi.updateStep(pipelineId, step.id, c), null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? (
          <h1 className="text-2xl font-semibold">{step.name}</h1>
        ) : (
          <>
            <h1 className="sr-only">{step.name}</h1>
            <label className="sr-only" htmlFor="step-name">
              {t("stepName")}
            </label>
            <input
              id="step-name"
              className="min-w-40 flex-1 rounded border px-2 py-1 text-xl font-semibold"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== step.name && update({ name: name.trim() })}
            />
          </>
        )}
        {step.step_type_name && step.step_type_name !== step.name && (
          <span className="text-xs opacity-60">{step.step_type_name}</span>
        )}
        <DueBadge due={due} />
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          {t("status")}
          <select
            className="rounded border px-2 py-1"
            disabled={readOnly || change.busy}
            value={step.status_key}
            onChange={(e) => update({ status_key: e.target.value })}
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
              disabled={readOnly || change.busy}
              value={step[key] ?? ""}
              onChange={(e) => update({ [key]: e.target.value || null })}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="step-note">{t("note")}</label>
        <textarea
          id="step-note"
          className="rounded border px-2 py-1"
          rows={2}
          maxLength={4000}
          disabled={readOnly}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== step.note && update({ note })}
        />
      </div>
      <Note message={change.message} />
    </section>
  );
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
