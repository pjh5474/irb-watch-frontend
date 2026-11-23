"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type Message, Note, errorText } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import {
  RUN_POLL_MS,
  type PlanField,
  type PlanForm,
  type PlanRecord,
  type PlanRun,
  type PlanValues,
  codePrefix,
  isOpenRun,
  isShown,
  newPlanApi,
  unwrapValues,
  valuesToSave,
} from "@/lib/api/new-plan";
import { useSingleFlight } from "@/lib/use-single-flight";

/**
 * "Write the R-BAY 신규계획 draft" (owner, 2026-11-23): the form comes from the server as data; the
 * values are saved as versions, checked without touching R-BAY, then a background run fills Part I
 * and Part II and saves them as a DRAFT on R-BAY (never submitted). Closed until asked for, so the
 * step page makes no extra call. Only the pipeline owner can use it (the server answers 404 to others).
 */
export function StepNewPlan({ stepId }: { stepId: number }) {
  const t = useTranslations("pipelines");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("newPlan.open")}
        </Button>
      </div>
    );
  return <Panel stepId={stepId} onClose={() => setOpen(false)} />;
}

/** Loads the form and the newest saved values; the editor starts from them once (no effect copies them). */
function Panel({ stepId, onClose }: { stepId: number; onClose: () => void }) {
  const t = useTranslations("pipelines");
  const formQ = useQuery({ queryKey: ["new-plan", stepId, "form"], queryFn: () => newPlanApi.form(stepId) });
  const valuesQ = useQuery({
    queryKey: ["new-plan", stepId, "values"],
    queryFn: () => newPlanApi.values(stepId),
    staleTime: Infinity, // the editor owns the values after the first load
  });
  if (formQ.isSuccess && valuesQ.isSuccess)
    return <Editor stepId={stepId} form={formQ.data} record={valuesQ.data} onClose={onClose} />;
  return (
    <section className="flex flex-col gap-3 rounded border p-4 text-sm" aria-labelledby={`new-plan-${stepId}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={`new-plan-${stepId}`} className="font-medium">
          {t("newPlan.title")}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("newPlan.close")}
        </Button>
      </div>
      {(formQ.isLoading || valuesQ.isLoading) && <p className="opacity-70">{t("loading")}</p>}
      {(formQ.isError || valuesQ.isError) && (
        <p role="alert" className="text-red-600">
          {errorText(formQ.error ?? valuesQ.error, t)}
        </p>
      )}
    </section>
  );
}

function Editor({
  stepId, form, record, onClose,
}: {
  stepId: number;
  form: PlanForm;
  record: PlanRecord | null;
  onClose: () => void;
}) {
  const t = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [showHistory, setShowHistory] = useState(false);

  const runsQ = useQuery({
    queryKey: ["new-plan", stepId, "runs"],
    queryFn: () => newPlanApi.runs(stepId),
    refetchInterval: (q) => (q.state.data?.some(isOpenRun) ? RUN_POLL_MS : false),
  });
  const historyQ = useQuery({
    queryKey: ["new-plan", stepId, "history"],
    queryFn: () => newPlanApi.runs(stepId, true),
    enabled: showHistory,
  });

  const [projectKey, setProjectKey] = useState(() => {
    const keys = Object.keys(form.types);
    return record?.project_key ?? (keys.includes("other_research") ? "other_research" : (keys[0] ?? ""));
  });
  const [affiliation, setAffiliation] = useState(record?.affiliation ?? "");
  const [values, setValues] = useState<PlanValues>(() => (record ? unwrapValues(record.values) : {}));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<"start" | "release" | null>(null);

  const runs = runsQ.data ?? [];
  const open = runs.some(isOpenRun);
  const held = runs.some((r) => r.draft_may_exist);

  function edit(change: () => void) {
    change();
    setDirty(true);
    setProblems(null);
    setConfirming(null);
  }

  async function act(work: () => Promise<string | null>) {
    setMessage(null);
    await flight.run(async () => {
      try {
        const ok = await work();
        if (ok) setMessage({ kind: "ok", text: ok });
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, t) });
      }
    });
  }

  async function saveNow(form: PlanForm) {
    await newPlanApi.save(stepId, { project_key: projectKey, affiliation, values: valuesToSave(form, values, projectKey) });
    setDirty(false);
    await queryClient.invalidateQueries({ queryKey: ["new-plan", stepId, "values"] });
  }

  const save = (form: PlanForm) => act(async () => (await saveNow(form), t("newPlan.saved")));

  const check = (form: PlanForm) =>
    act(async () => {
      if (dirty) await saveNow(form);
      const answer = await newPlanApi.check(stepId);
      setProblems(answer.problems);
      return answer.ready ? t("newPlan.checkOk") : null;
    });

  const start = (form: PlanForm) =>
    act(async () => {
      setConfirming(null);
      if (dirty) await saveNow(form);
      const answer = await newPlanApi.check(stepId);
      setProblems(answer.problems);
      if (!answer.ready) return null; // nothing is sent to R-BAY; the reasons are listed
      await newPlanApi.start(stepId);
      await queryClient.invalidateQueries({ queryKey: ["new-plan", stepId] });
      return t("newPlan.started");
    });

  const release = () =>
    act(async () => {
      setConfirming(null);
      await newPlanApi.release(stepId);
      await queryClient.invalidateQueries({ queryKey: ["new-plan", stepId] });
      return t("newPlan.released");
    });

  return (
    <section className="flex flex-col gap-3 rounded border p-4 text-sm" aria-labelledby={`new-plan-${stepId}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={`new-plan-${stepId}`} className="font-medium">
          {t("newPlan.title")}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("newPlan.close")}
        </Button>
      </div>
      <p className="opacity-70">{t("newPlan.explain")}</p>

      {!form.available && <p className="text-amber-700 dark:text-amber-300">{t("newPlan.notAvailable")}</p>}

      <>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              {t("newPlan.projectType")}
              <select
                className="rounded border px-2 py-1"
                value={projectKey}
                disabled={flight.busy}
                onChange={(e) => edit(() => setProjectKey(e.target.value))}
              >
                {Object.entries(form.types).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-64 flex-1 flex-col gap-1">
              {t("newPlan.affiliation")}
              <input
                className="rounded border px-2 py-1"
                value={affiliation}
                maxLength={200}
                disabled={flight.busy}
                onChange={(e) => edit(() => setAffiliation(e.target.value))}
              />
              <span className="text-xs opacity-60">{t("newPlan.affiliationHelp")}</span>
            </label>
          </div>

          {form.pages.map((page, index) => {
            const shown = page.fields.filter((f) => isShown(f, page.fields, values, projectKey));
            const body = (
              <div className="flex flex-col gap-3">
                {shown.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    values={values}
                    disabled={flight.busy}
                    onChange={(value) => edit(() => setValues((old) => ({ ...old, [f.key]: value })))}
                  />
                ))}
              </div>
            );
            return index === 0 ? (
              <fieldset key={page.form} className="flex flex-col gap-3 rounded border p-3">
                <legend className="px-1 font-medium">{t("newPlan.part1")}</legend>
                {body}
              </fieldset>
            ) : (
              <details key={page.form} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">{t("newPlan.part2")}</summary>
                <p className="my-2 opacity-70">{t("newPlan.part2Help")}</p>
                {body}
              </details>
            );
          })}

          <p className="text-amber-700 dark:text-amber-300">{t("newPlan.tempResearcher")}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={flight.busy || !dirty} onClick={() => save(form)}>
              {t("newPlan.save")}
            </Button>
            <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => check(form)}>
              {t("newPlan.check")}
            </Button>
            <Button
              size="sm"
              disabled={flight.busy || !runsQ.isSuccess || open || held || !form.available}
              onClick={() => setConfirming("start")}
            >
              {t("newPlan.start")}
            </Button>
            {dirty && <span className="opacity-70">{t("newPlan.unsaved")}</span>}
          </div>
          {held && !open && <p className="opacity-70">{t("newPlan.heldNote")}</p>}

          {confirming === "start" && (
            <div role="alertdialog" aria-label={t("newPlan.startConfirmTitle")} className="flex flex-col gap-2 rounded border border-amber-400 p-3">
              <p>{t("newPlan.startConfirm")}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={flight.busy} onClick={() => start(form)}>
                  {t("newPlan.startYes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}

          {problems !== null && problems.length > 0 && (
            <div role="alert" className="text-red-600">
              <p>{t("newPlan.problems")}</p>
              <ul className="list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
      </>
      <Note message={message} />

      <div className="flex flex-col gap-2 border-t pt-3">
        <h3 className="font-medium">{t("newPlan.runs")}</h3>
        {runsQ.isError && (
          <p role="alert" className="text-red-600">
            {errorText(runsQ.error, t)}
          </p>
        )}
        {runsQ.isSuccess && runs.length === 0 && <p className="opacity-70">{t("newPlan.noRuns")}</p>}
        <RunList runs={runs} />
        {held && !open && (
          <div className="flex flex-col gap-2">
            {confirming === "release" ? (
              <div role="alertdialog" aria-label={t("newPlan.releaseTitle")} className="flex flex-col gap-2 rounded border border-amber-400 p-3">
                <p>{t("newPlan.releaseConfirm")}</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={flight.busy} onClick={release}>
                    {t("newPlan.releaseYes")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => setConfirming("release")}>
                  {t("newPlan.release")}
                </Button>
              </div>
            )}
          </div>
        )}
        <div>
          <Button size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("newPlan.hideHistory") : t("newPlan.history")}
          </Button>
        </div>
        {showHistory && historyQ.isLoading && <p className="opacity-70">{t("loading")}</p>}
        {showHistory && historyQ.isError && (
          <p role="alert" className="text-red-600">
            {errorText(historyQ.error, t)}
          </p>
        )}
        {showHistory && historyQ.data && <RunList runs={historyQ.data} />}
      </div>
    </section>
  );
}

function RunList({ runs }: { runs: PlanRun[] }) {
  const t = useTranslations("pipelines");
  if (runs.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-col gap-0.5 rounded border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t(`newPlan.status.${r.status}`)}</span>
            <span className="opacity-70">{t(`newPlan.stage.${r.stage}`)}</span>
            <span className="opacity-70">v{r.record_version}</span>
            <time className="tabular-nums opacity-60" dateTime={r.created_at}>
              {new Date(r.created_at).toLocaleString()}
            </time>
          </div>
          {r.draft_title && (
            <p>
              {t("newPlan.draftTitle")}: <span className="font-medium">{r.draft_title}</span>
            </p>
          )}
          {r.draft_may_exist && <p className="text-amber-700 dark:text-amber-300">{t("newPlan.draftHeld")}</p>}
          {r.error && (
            <p role="alert" className="text-red-600">
              {r.error}
            </p>
          )}
          {r.status === "done" && <p className="text-green-700 dark:text-green-400">{t("newPlan.doneNote")}</p>}
        </li>
      ))}
    </ul>
  );
}

function FieldInput({
  field, values, disabled, onChange,
}: {
  field: PlanField;
  values: PlanValues;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations("pipelines");
  const value = values[field.key];
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? (value as string[]) : [];
  const label = (
    <>
      {field.label}
      {field.required && (
        <span className="text-red-600" aria-label={t("newPlan.required")}>
          {" "}
          *
        </span>
      )}
    </>
  );
  // The model's notes are developer notes (R-BAY element names, how a field was measured): not shown.
  const help = null;
  // R-BAY's own option text where it is known (Part I); the option key otherwise.
  const optionText = (o: string) => field.option_labels?.[o] ?? o;

  if (!field.supported)
    return (
      <div className="flex flex-col gap-1 opacity-60">
        <span>{label}</span>
        <span className="text-xs">{t("newPlan.fileUnsupported")}</span>
      </div>
    );

  if (field.kind === "radio")
    return (
      <fieldset className="flex flex-col gap-1">
        <legend>{label}</legend>
        <div className="flex flex-wrap gap-3">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-1">
              <input type="radio" name={field.key} checked={text === o} disabled={disabled} onChange={() => onChange(o)} />
              {optionText(o)}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );

  if (field.kind === "multi")
    return (
      <fieldset className="flex flex-col gap-1">
        <legend>{label}</legend>
        <div className="flex flex-wrap gap-3">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={list.includes(o)}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
              />
              {optionText(o)}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );

  if (field.kind === "select" && !field.dynamic_options)
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select className="rounded border px-2 py-1" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {field.options.map((o) => (
            <option key={o} value={o}>
              {optionText(o)}
            </option>
          ))}
        </select>
        {help}
      </label>
    );

  if (field.kind === "textarea")
    return (
      <label className="flex flex-col gap-1">
        {label}
        <textarea
          className="min-h-20 rounded border px-2 py-1"
          value={text}
          maxLength={field.max_length ?? undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {help}
      </label>
    );

  // text, lookup, date, and a select whose list R-BAY loads (typed as its code)
  const prefix = field.kind === "select" ? codePrefix(field, values) : null;
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        className="rounded border px-2 py-1"
        type={field.kind === "date" ? "date" : "text"}
        inputMode={field.numeric ? "numeric" : undefined}
        value={text}
        maxLength={field.max_length ?? undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.kind === "lookup" && <span className="text-xs opacity-60">{t("newPlan.lookupHelp")}</span>}
      {field.kind === "select" && (
        <span className="text-xs opacity-60">{t("newPlan.codeHelp", { prefix: prefix ?? "—" })}</span>
      )}
      {help}
    </label>
  );
}
