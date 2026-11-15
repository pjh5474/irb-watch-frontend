"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { History, Note, errorText, stepKey, useChange } from "@/components/pipelines/shared";
import { StepDocuments, missingRequired } from "@/components/pipelines/step/step-documents";
import { StepHeader } from "@/components/pipelines/step/step-header";
import { StepSession } from "@/components/pipelines/step/step-session";
import { StepDrafts } from "@/components/pipelines/step-drafts";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { JOB_POLL_MS, isOpenJob } from "@/lib/api/docgen";
import { docgenEnabled } from "@/lib/features";
import { type StepPage, pipelineApi, stepLabel } from "@/lib/api/pipelines";
import { siteLabel } from "@/lib/api/sites";

/**
 * One step of a pipeline on its own page (phase A): header, documents, AI drafts and the
 * step's history. A removed step, or a step of a removed pipeline, is shown read-only. The
 * page asks again every few seconds only while one of its draft jobs is open.
 */
export function StepPageView({ id, stepId }: { id: number; stepId: number }) {
  const t = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const page = useQuery({
    queryKey: stepKey(id, stepId),
    queryFn: () => pipelineApi.getStep(id, stepId),
    refetchInterval: (q) => (q.state.data?.jobs.some(isOpenJob) ? JOB_POLL_MS : false),
  });

  // A job of this step ended: the usage counter, the Drafts page and the overview changed.
  const open = page.data?.jobs.filter(isOpenJob).length;
  const openBefore = useRef(0);
  useEffect(() => {
    if (open === undefined) return;
    if (open < openBefore.current) {
      void queryClient.invalidateQueries({ queryKey: ["docgen", "drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["docgen", "status"] });
      void queryClient.invalidateQueries({ queryKey: ["docgen", "jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["pipelines", "detail", id] });
    }
    openBefore.current = open;
  }, [open, id, queryClient]);

  if (page.isLoading) return <main className="mx-auto w-full max-w-4xl p-6 text-sm opacity-70">{t("loading")}</main>;
  if (page.isError || !page.data)
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-2 p-6">
        <Link href={`/pipelines/${id}`} className="text-sm underline-offset-4 hover:underline">
          ← {t("backToPipeline")}
        </Link>
        <p role="alert" className="text-sm text-red-600">
          {errorText(page.error, t)}
        </p>
      </main>
    );

  const d = page.data;
  const p = d.pipeline;
  const step = d.step;
  const pipelineRemoved = p.deleted_at !== null;
  const stepRemoved = step.deleted_at !== null;
  const viewOnly = d.access === "read"; // a platform admin's support access: change nothing
  const readOnly = pipelineRemoved || stepRemoved || viewOnly;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/projects/${p.project_id}`} className="underline-offset-4 hover:underline">
          {t("backToProject")}
        </Link>
        <span aria-hidden>›</span>
        <Link href={`/pipelines/${id}`} className="underline-offset-4 hover:underline">
          {t("title", { name: p.hospital_name ?? t("siteUnavailable") })}
          {siteLabel(p) && ` · ${siteLabel(p)}`}
        </Link>
        <span aria-hidden>›</span>
        {d.parent && (
          <>
            <Link href={`/pipelines/${id}/steps/${d.parent.id}`} className="underline-offset-4 hover:underline">
              {stepLabel(d.parent)}
            </Link>
            <span aria-hidden>›</span>
          </>
        )}
        <span className="opacity-70">{stepLabel(step)}</span>
        <span className="ml-auto flex gap-2">
          {d.previous_step_id !== null && (
            <Link href={`/pipelines/${id}/steps/${d.previous_step_id}`} className="underline-offset-4 hover:underline">
              ← {t("previousStep")}
            </Link>
          )}
          {d.next_step_id !== null && (
            <Link href={`/pipelines/${id}/steps/${d.next_step_id}`} className="underline-offset-4 hover:underline">
              {t("nextStep")} →
            </Link>
          )}
        </span>
      </nav>

      {viewOnly && <p className="text-sm text-amber-700 dark:text-amber-300">{t("viewOnlyNote")}</p>}
      {pipelineRemoved ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t("pipelineRemovedStepNote")}{" "}
          <Link href={`/pipelines/${id}`} className="underline underline-offset-4">
            {t("backToPipeline")}
          </Link>
        </p>
      ) : (
        stepRemoved && !viewOnly && <RestoreStep pipelineId={id} stepId={step.id} />
      )}

      {d.parent && (
        <p className="text-sm">
          {t("answerTo")}{" "}
          <Link href={`/pipelines/${id}/steps/${d.parent.id}`} className="underline underline-offset-4">
            {stepLabel(d.parent)}
          </Link>
        </p>
      )}
      <StepHeader
        key={`header-${step.id}`} pipelineId={id} step={step} statuses={d.statuses} readOnly={readOnly}
        results={d.results ?? []} suggestedStatus={d.suggested_status ?? null}
        missingRequired={missingRequired(d)}
      />
      {/* An older server sends no session fields: the section waits for CAL-1's backend. */}
      {d.session_kinds !== undefined && (
        <StepSession key={`session-${step.id}`} pipelineId={id} page={d} readOnly={readOnly} />
      )}
      <StepDocuments pipelineId={id} page={d} readOnly={readOnly} />
      {!d.parent && (
        <FollowUps key={`follow-${step.id}`} pipelineId={id} page={d} readOnly={readOnly} />
      )}
      {docgenEnabled() && (
        <StepDrafts
          key={`drafts-${step.id}`}
          pipelineId={id}
          step={step}
          drafts={d.drafts}
          jobs={d.jobs}
          readOnly={readOnly}
          shared={d.shared}
        />
      )}
      <History key={`history-${step.id}`} id={id} stepId={step.id} />
      {!readOnly && <RemoveStep key={`remove-${step.id}`} pipelineId={id} stepId={step.id} />}
    </main>
  );
}

/**
 * The follow-up steps of a main step (행정수정 답변, 보완/시정 답변, 재심의) and "Add follow-up
 * step", always offered and highlighted when the IRB result asks for an answer (owner).
 */
function FollowUps({ pipelineId, page, readOnly }: { pipelineId: number; page: StepPage; readOnly: boolean }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const types = page.follow_up_types ?? [];
  const [type, setType] = useState(types[0] ? String(types[0].id) : "");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const answers = page.follow_ups ?? [];
  const highlight = page.needs_answer ?? false;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!type && !name.trim()) return change.setMessage({ kind: "error", text: t("needStep") });
    const ok = await change.run(
      () =>
        pipelineApi.addStep(pipelineId, {
          step_type_id: type ? Number(type) : null,
          name: name.trim() || null,
          parent_step_id: page.step.id,
          subject: subject.trim(),
        }),
      t("followUpAdded"),
    );
    if (ok) {
      setName("");
      setSubject("");
    }
  }

  return (
    <section
      className={`flex flex-col gap-2 rounded border p-4 text-sm ${highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""}`}
      aria-labelledby={`follow-ups-${page.step.id}`}
    >
      <h2 id={`follow-ups-${page.step.id}`} className="font-medium">
        {t("followUps")}
      </h2>
      {highlight && <p className="text-amber-800 dark:text-amber-200">{t("needsAnswerNote")}</p>}
      {answers.length === 0 ? (
        <p className="opacity-70">{t("noFollowUps")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {answers.map((a) => (
            <li key={a.id}>
              <Link href={`/pipelines/${pipelineId}/steps/${a.id}`} className="underline-offset-4 hover:underline">
                {stepLabel(a)}
              </Link>
              {a.subject && <span className="opacity-70"> ({a.subject})</span>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            {t("stepType")}
            <select className="rounded border px-2 py-1" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="">{t("freeStep")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {type ? t("nameOptional") : t("stepName")}
            <input className="rounded border px-2 py-1" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            {t("subjectOptional")}
            <input className="rounded border px-2 py-1" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <Button type="submit" size="sm" variant={highlight ? "default" : "outline"} disabled={change.busy}>
            {t("addFollowUp")}
          </Button>
        </form>
      )}
      <Note message={change.message} />
    </section>
  );
}

function RestoreStep({ pipelineId, stepId }: { pipelineId: number; stepId: number }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
      {t("stepRemovedNote")}
      <Button size="sm" variant="outline" disabled={change.busy} onClick={() => change.run(() => pipelineApi.restoreStep(pipelineId, stepId), t("restored"))}>
        {t("restore")}
      </Button>
      <Note message={change.message} />
    </div>
  );
}

function RemoveStep({ pipelineId, stepId }: { pipelineId: number; stepId: number }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
      {confirming ? (
        <>
          <span>{t("confirmRemoveStep")}</span>
          <Button size="sm" variant="destructive" disabled={change.busy} onClick={() => change.run(() => pipelineApi.removeStep(pipelineId, stepId), null)}>
            {t("remove")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {t("removeStep")}
        </Button>
      )}
      <Note message={change.message} />
    </section>
  );
}
