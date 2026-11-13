"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DraftJobLines } from "@/components/drafts/draft-jobs";
import { errorText } from "@/components/pipelines/shared";
import { DueBadge } from "@/components/pipelines/step/step-header";
import { Link } from "@/i18n/navigation";
import { type WorkStep, workApi } from "@/lib/api/work";

/**
 * "My IRB work": what needs doing over all the user's projects. Four lists, each line opens its
 * step page: overdue and due soon, waiting for the IRB, required documents missing, AI drafts
 * being written or failed.
 */
export function WorkView() {
  const t = useTranslations("work");
  const tp = useTranslations("pipelines");
  const [mine, setMine] = useState(false);
  const work = useQuery({ queryKey: ["work", mine], queryFn: () => workApi.get(mine) });

  if (work.isLoading) return <main className="mx-auto w-full max-w-4xl p-6 text-sm opacity-70">{tp("loading")}</main>;
  if (work.isError || !work.data)
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {errorText(work.error, tp)}
        </p>
      </main>
    );
  const w = work.data;
  const empty = !w.due.length && !w.waiting.length && !w.missing.length && !w.drafts.length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm opacity-70">{t("intro", { days: w.window_days })}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("mineOnly")}
        </label>
      </header>
      {empty && <p className="text-sm opacity-70">{t("nothing")}</p>}

      <WorkList title={t("due", { days: w.window_days })} steps={w.due} detail={(s) => <DueBadge due={s.days_left} />} />
      <WorkList
        title={t("waiting")}
        steps={w.waiting}
        detail={(s) => (s.submitted_on ? <span className="text-xs opacity-70">{t("submittedOn", { date: s.submitted_on })}</span> : null)}
      />
      <WorkList
        title={t("missing")}
        steps={w.missing}
        detail={(s) => (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {t("missingCount", { n: s.required_missing, total: s.required })}
          </span>
        )}
      />

      {w.drafts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">{t("drafts")}</h2>
          <ul className="flex flex-col gap-2">
            {w.drafts.map(({ job, step }) => (
              <li key={job.id} className="flex flex-col gap-1 rounded border p-3 text-sm">
                <StepLink step={step} />
                <DraftJobLines jobs={[job]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function WorkList({ title, steps, detail }: { title: string; steps: WorkStep[]; detail: (s: WorkStep) => React.ReactNode }) {
  if (steps.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">
        {title} <span className="opacity-60">({steps.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.step_id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm">
            <StepLink step={s} />
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{s.status_label}</span>
            {detail(s)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepLink({ step }: { step: WorkStep }) {
  const t = useTranslations("work");
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/pipelines/${step.pipeline_id}/steps/${step.step_id}`} className="font-medium underline-offset-4 hover:underline">
        {step.step_name}
      </Link>
      <span className="text-xs opacity-70">
        {step.project_name ?? t("projectGone")} · {step.hospital_name ?? t("hospitalGone")}
        {step.site_label ? ` · ${step.site_label}` : ""}
      </span>
    </span>
  );
}
