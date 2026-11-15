"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ProposeSession } from "@/components/calendar/calendar-view";
import { DateTime, SessionFacts, SessionStateBadge, kindLabel } from "@/components/calendar/session-parts";
import { Note, useChange } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import type { IrbSession } from "@/lib/api/calendar";
import { daysUntil, pipelineApi, type StepPage, todaySeoul } from "@/lib/api/pipelines";

/**
 * The IRB meeting a step aims for (CAL-1). The list offers the hospital's upcoming sessions,
 * proposals marked; the hint (the next approved session whose cutoff is still open) is
 * highlighted but nothing is saved until the user picks. A target that was cancelled, rejected
 * or removed keeps its link and shows a warning. The daily mail reminds of the cutoff.
 */
export function StepSession({ pipelineId, page, readOnly }: { pipelineId: number; page: StepPage; readOnly: boolean }) {
  const t = useTranslations("sessions");
  const change = useChange();
  const [proposing, setProposing] = useState(false);
  const sessions = page.sessions ?? [];
  const kinds = page.session_kinds ?? [];
  const target = page.target_session ?? null;
  const warning = page.target_warning ?? null;
  const suggested = sessions.find((s) => s.id === page.suggested_session_id) ?? null;
  const today = todaySeoul();
  const pick = (id: number | null) =>
    change.run(() => pipelineApi.updateStep(pipelineId, page.step.id, { target_session_id: id }), id ? t("targetSet") : t("targetCleared"));
  const label = (s: IrbSession) =>
    `${kindLabel(kinds, s.kind_key)} ${s.meets_on}${s.cutoff_on ? ` (${t("cutoffShort", { date: s.cutoff_on })})` : ""}${
      s.state === "proposed" ? ` · ${t("state.proposed")}` : s.state === "tentative" ? ` · ${t("state.tentative")}` : ""
    }`;
  const deadline = target ? (target.cutoff_on ?? target.meets_on) : null;
  const left = deadline ? daysUntil(deadline, today) : null;

  return (
    <section aria-labelledby="step-session" className="flex flex-col gap-2 rounded border p-4 text-sm">
      <h2 id="step-session" className="font-medium">
        {t("targetTitle")}
      </h2>
      {warning === "unavailable" && (
        <p role="alert" className="text-red-600">
          {t("warnings.unavailable")}
        </p>
      )}
      {target ? (
        <div className="flex flex-col gap-2">
          <SessionFacts session={target} kinds={kinds} hospital={page.pipeline.hospital_name} />
          {left !== null && !warning && (
            <p className={left < 0 ? "text-red-700" : left <= 14 ? "text-amber-700 dark:text-amber-300" : "opacity-80"}>
              {left < 0 ? t("deadlinePassed", { n: -left }) : t("deadlineIn", { n: left })}
            </p>
          )}
        </div>
      ) : (
        warning !== "unavailable" && <p className="opacity-70">{t("noTarget")}</p>
      )}
      {warning && warning !== "unavailable" && (
        <p role="alert" className="text-red-700">
          {t(`warnings.${warning}`)}
        </p>
      )}
      {!readOnly && warning !== "unavailable" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-col gap-1">
            {t("pick")}
            <select
              className="rounded border px-2 py-1"
              disabled={change.busy}
              value={target && sessions.some((s) => s.id === target.id) ? String(target.id) : ""}
              onChange={(e) => void pick(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("noTargetOption")}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                  {s.id === suggested?.id ? ` ★ ${t("suggested")}` : ""}
                </option>
              ))}
            </select>
          </label>
          {suggested && suggested.id !== target?.id && (
            <Button size="sm" variant="outline" disabled={change.busy} onClick={() => void pick(suggested.id)}>
              {t("useSuggested", { label: label(suggested) })}
            </Button>
          )}
          {target && (
            <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => void pick(null)}>
              {t("clearTarget")}
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-expanded={proposing} onClick={() => setProposing((v) => !v)}>
            {t("proposeMissing")}
          </Button>
        </div>
      )}
      {sessions.length === 0 && warning !== "unavailable" && <p className="text-xs opacity-70">{t("noUpcoming")}</p>}
      {suggested && !target && (
        <p className="flex flex-wrap items-center gap-2 text-xs opacity-80">
          {t("hint")} <DateTime day={suggested.cutoff_on ?? suggested.meets_on} time={suggested.cutoff_on ? suggested.cutoff_at : suggested.meets_at} />
          <SessionStateBadge state={suggested.state} />
        </p>
      )}
      {proposing && (
        <ProposeSession
          data={{ hospitals: { [String(page.pipeline.hospital_id)]: page.pipeline.hospital_name ?? "" }, kinds }}
          hospitalId={page.pipeline.hospital_id}
          onDone={() => setProposing(false)}
        />
      )}
      <Note message={change.message} />
    </section>
  );
}
