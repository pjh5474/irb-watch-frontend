"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { History, Note, detailKey, errorText, useChange } from "@/components/pipelines/shared";
import { DueBadge } from "@/components/pipelines/step/step-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { type OverviewStep, type PipelineDetail, type PipelineStatus, daysUntil, pipelineApi, todaySeoul } from "@/lib/api/pipelines";

/**
 * The pipeline overview (phase A): one row per step with its status, dates and counts; each
 * row opens the step's own page, where documents and drafts are. Also: add, reorder, removed
 * steps, the whole history and removing the pipeline.
 */
export function PipelineView({ id }: { id: number }) {
  const t = useTranslations("pipelines");
  const detail = useQuery({ queryKey: detailKey(id), queryFn: () => pipelineApi.get(id) });
  const change = useChange();
  const [showRemoved, setShowRemoved] = useState(false);

  if (detail.isLoading) return <main className="mx-auto w-full max-w-4xl p-6 text-sm opacity-70">{t("loading")}</main>;
  if (detail.isError || !detail.data)
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {errorText(detail.error, t)}
        </p>
      </main>
    );
  const d = detail.data;
  const p = d.pipeline;
  const removed = p.deleted_at !== null;
  const viewOnly = d.access === "read"; // a platform admin's support access: change nothing
  const readOnly = removed || viewOnly;
  const live = d.steps.filter((s) => s.deleted_at === null);
  const gone = d.steps.filter((s) => s.deleted_at !== null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Link href={`/projects/${p.project_id}`} className="text-sm underline-offset-4 hover:underline">
          ← {t("backToProject")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title", { name: p.hospital_name ?? t("siteUnavailable") })}</h1>
        <p className="text-sm opacity-70">{t("progress", { closed: p.closed_steps, steps: p.steps })}</p>
        {!p.in_project && <p className="text-sm text-amber-700 dark:text-amber-300">{t("notInProjectNote")}</p>}
        {viewOnly && <p className="text-sm text-amber-700 dark:text-amber-300">{t("viewOnlyNote")}</p>}
        {removed && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            {t("removedNote")}
            {!viewOnly && (
              <Button size="sm" variant="outline" disabled={change.busy} onClick={() => change.run(() => pipelineApi.restore(id), t("restored"))}>
                {t("restore")}
              </Button>
            )}
          </div>
        )}
        <Note message={change.message} />
      </header>

      {live.length === 0 && <p className="text-sm opacity-70">{t("noSteps")}</p>}
      <ol className="flex flex-col gap-2">
        {live.map((step, i) => (
          <StepRow key={step.id} pipelineId={id} step={step} statuses={d.statuses} index={i} order={live.map((s) => s.id)} readOnly={readOnly} />
        ))}
      </ol>

      {!readOnly && <AddStep pipelineId={id} types={d.step_types} />}

      {gone.length > 0 && (
        <section className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
            {t("showRemovedSteps", { n: gone.length })}
          </label>
          {showRemoved && (
            <ul className="flex flex-col gap-1">
              {gone.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Link href={`/pipelines/${id}/steps/${s.id}`} className="flex-1 opacity-70 underline-offset-4 hover:underline">
                    {s.name}
                  </Link>
                  {!readOnly && (
                    <Button size="sm" variant="outline" disabled={change.busy} onClick={() => change.run(() => pipelineApi.restoreStep(id, s.id), t("restored"))}>
                      {t("restore")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <History id={id} stepNames={new Map(d.steps.map((s) => [s.id, s.name]))} />

      {!readOnly && <RemovePipeline id={id} />}
    </main>
  );
}

function RemovePipeline({ id }: { id: number }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
      {confirming ? (
        <>
          <span>{t("confirmRemovePipeline")}</span>
          <Button size="sm" variant="destructive" disabled={change.busy} onClick={() => change.run(() => pipelineApi.remove(id), t("removedDone"))}>
            {t("remove")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          {t("removePipeline")}
        </Button>
      )}
      <Note message={change.message} />
    </section>
  );
}

/** One step: number, name (opens the step page), status, dates and counts; move up or down. */
function StepRow({
  pipelineId,
  step,
  statuses,
  index,
  order,
  readOnly,
}: {
  pipelineId: number;
  step: OverviewStep;
  statuses: PipelineStatus[];
  index: number;
  order: number[];
  readOnly: boolean;
}) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const status = statuses.find((s) => s.key === step.status_key);
  const due = step.due_on && !status?.closed ? daysUntil(step.due_on, todaySeoul()) : null;
  const move = (by: -1 | 1) => {
    const ids = [...order];
    const to = index + by;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    return change.run(() => pipelineApi.reorder(pipelineId, ids), null);
  };
  const dates = (["submitted_on", "decided_on"] as const).filter((k) => step[k]);

  return (
    <li className="flex flex-col gap-1 rounded border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums opacity-60">{index + 1}.</span>
        <Link href={`/pipelines/${pipelineId}/steps/${step.id}`} className="font-medium underline-offset-4 hover:underline">
          {step.name}
        </Link>
        {step.step_type_name && step.step_type_name !== step.name && (
          <span className="text-xs opacity-60">{step.step_type_name}</span>
        )}
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{status?.label ?? step.status_key}</span>
        {status?.closed && <Check className="size-4 text-green-700" aria-label={t("finished")} />}
        <DueBadge due={due} />
        {!readOnly && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" disabled={change.busy || index === 0} onClick={() => move(-1)} aria-label={t("up", { name: step.name })}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" disabled={change.busy || index === order.length - 1} onClick={() => move(1)} aria-label={t("down", { name: step.name })}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
        {step.due_on && <span>{t("due_on")} {step.due_on}</span>}
        {dates.map((k) => (
          <span key={k}>
            {t(k)} {step[k]}
          </span>
        ))}
        <span>{t("docCount", { n: step.documents })}</span>
        {step.required > 0 && (
          <span className={step.required_missing > 0 ? "text-amber-700 dark:text-amber-300" : ""}>
            {t("requiredCount", { done: step.required - step.required_missing, total: step.required })}
          </span>
        )}
        {step.drafts > 0 && <span>{t("draftCount", { n: step.drafts })}</span>}
        {step.open_jobs > 0 && (
          <span className="flex items-center gap-1" role="status">
            <Spinner aria-hidden />
            {t("writing")}
          </span>
        )}
      </div>
      <Note message={change.message} />
    </li>
  );
}

function AddStep({ pipelineId, types }: { pipelineId: number; types: PipelineDetail["step_types"] }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [type, setType] = useState("");
  const [name, setName] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!type && !name.trim()) return change.setMessage({ kind: "error", text: t("needStep") });
    const ok = await change.run(
      () => pipelineApi.addStep(pipelineId, { step_type_id: type ? Number(type) : null, name: name.trim() || null }),
      t("stepAdded"),
    );
    if (ok) {
      setType("");
      setName("");
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded border border-dashed p-4 text-sm">
      <h2 className="font-medium">{t("addStepTitle")}</h2>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          {t("stepType")}
          <select className="rounded border px-2 py-1" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("freeStep")}</option>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {type ? t("nameOptional") : t("stepName")}
          <input className="rounded border px-2 py-1" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={change.busy}>
          {t("add")}
        </Button>
      </form>
      <Note message={change.message} />
    </section>
  );
}
