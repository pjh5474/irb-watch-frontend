"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { type Message, Note, errorText } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import {
  RUN_POLL_MS,
  type DocEntry,
  type PlanField,
  type PlanFile,
  type PlanForm,
  type PlanRecord,
  type PlanRow,
  type PlanRun,
  type PlanValues,
  blockedOptions,
  cleanMulti,
  codePrefix,
  dependentList,
  docEntries,
  entryFromFile,
  isOpenRun,
  isShown,
  newPlanApi,
  planRows,
  pruneValues,
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
  // The step's own files, for the attachment picker (only when the form has a file field the job writes).
  const hasFileField = form.pages.some((p) => p.fields.some((f) => f.kind === "file" && f.supported));
  const filesQ = useQuery({
    queryKey: ["new-plan", stepId, "files"],
    queryFn: () => newPlanApi.files(stepId),
    enabled: hasFileField,
  });
  const stepFiles = filesQ.data ?? [];

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

  // The files the next run would send to R-BAY (named in the start confirm: an upload cannot be undone there)
  const picked = Array.isArray(values["attachments.main"]) ? (values["attachments.main"] as string[]) : [];
  const pickedFiles = picked.flatMap((id) => stepFiles.filter((f) => String(f.version_id) === id));
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
                onChange={(e) =>
                  edit(() => {
                    setProjectKey(e.target.value);
                    setValues((old) => pruneValues(form, old, e.target.value)); // fields of the other type go
                  })
                }
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
            // R-BAY's headings in its order; a page without them is one block, as before
            const listed = new Set((page.sections ?? []).flatMap((s) => s.keys));
            const groups = [
              // the section's own key order is the order on screen
              ...(page.sections ?? []).map((s) => ({
                title: s.title,
                fields: s.keys.flatMap((k) => shown.filter((f) => f.key === k)),
              })),
              { title: "", fields: shown.filter((f) => !listed.has(f.key)) }, // never lose a field a heading list missed
            ];
            const body = (
              <div className="flex flex-col gap-4">
                {groups
                  .filter((g) => g.fields.length > 0)
                  .map((g) => (
                    <section key={g.title || "all"}>
                      {g.title && <h3 className="border-b-2 px-1 pb-1 text-base font-semibold">{g.title}</h3>}
                      <div className="rounded-b border-x border-b">
                        {g.fields.map((f) => (
                          <FieldInput
                            key={f.key}
                            field={f}
                            projectKey={projectKey}
                            values={values}
                            files={stepFiles}
                            filesState={filesQ.isError ? errorText(filesQ.error, t) : filesQ.isLoading ? "loading" : null}
                            disabled={flight.busy}
                            onChange={(value) =>
                              edit(() => setValues((old) => pruneValues(form, { ...old, [f.key]: value }, projectKey)))
                            }
                          />
                        ))}
                      </div>
                    </section>
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
              {pickedFiles.length > 0 && (
                <div>
                  <p className="font-medium text-red-700 dark:text-red-300">{t("newPlan.uploadWarning")}</p>
                  <ul className="list-disc pl-5">
                    {pickedFiles.map((f) => (
                      <li key={f.version_id}>{f.filename}</li>
                    ))}
                  </ul>
                </div>
              )}
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
  field, projectKey, values, files, filesState, disabled, onChange,
}: {
  field: PlanField;
  projectKey: string; // the chosen project type
  values: PlanValues;
  files: PlanFile[]; // the step's own files (for a file field)
  filesState: string | null; // "loading", an error text, or null
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
      {field.required && (!field.required_types || field.required_types.includes(projectKey)) && (
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

  const id = `np-${field.key}`;
  // R-BAY's look: the label in a shaded cell on the left, the answer beside it (stacked on a narrow screen).
  const row = (children: ReactNode, grouped = false) => (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 md:grid-cols-[13rem_1fr] md:items-start md:gap-3">
      {grouped ? (
        <span id={`${id}-label`} className="rounded bg-black/5 px-2 py-1 font-medium dark:bg-white/10">
          {label}
        </span>
      ) : (
        <label htmlFor={id} className="rounded bg-black/5 px-2 py-1 font-medium dark:bg-white/10">
          {label}
        </label>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );

  if (!field.supported)
    return row(<span className="text-xs opacity-60">{t("newPlan.fileUnsupported")}</span>, true);

  // The step's own files: tick the ones to attach. The value is the list of version ids (as text).
  if (field.kind === "file") {
    const ticked = list;
    const cap = field.multiple ? field.max_files : 1; // a box that takes one file (the 불필요 사유 근거문서)
    const full = cap !== null && ticked.length >= cap;
    return row(
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1">
        {filesState === "loading" && <span className="opacity-70">{t("loading")}</span>}
        {filesState !== null && filesState !== "loading" && (
          <span role="alert" className="text-red-600">
            {filesState}
          </span>
        )}
        {filesState === null && files.length === 0 && <span className="opacity-70">{t("newPlan.noFiles")}</span>}
        {files.map((f) => {
          const token = String(f.version_id);
          const on = ticked.includes(token);
          return (
            <label key={f.version_id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                disabled={disabled || (!on && full)}
                onChange={(e) => onChange(e.target.checked ? [...ticked, token] : ticked.filter((x) => x !== token))}
              />
              <span>
                {f.filename}
                <span className="opacity-60">
                  {" "}
                  — {f.document_name} v{f.version_no}, {Math.max(1, Math.round(f.size_bytes / 1024))} KB
                </span>
              </span>
            </label>
          );
        })}
        <span className="text-xs opacity-60">{t("newPlan.filesHelp")}</span>
      </div>,
      true,
    );
  }

  // The 의약품 / 의료기기 list: one row each, the boxes of R-BAY's pop-up. Rows are written to R-BAY's draft
  // when the run reaches this part (never edited there by the job), so the step then stays locked.
  if (field.kind === "rows" && field.rows) {
    const spec = field.rows;
    const rows = planRows(value);
    const set = (next: PlanRow[]) => onChange(next);
    const drugOnDrugStudy = field.key === "p2.drug.rows" && projectKey === "drug";
    return row(
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-1 rounded border p-2">
            {spec.fields.map((box) =>
              box.kind === "radio" ? (
                <div key={box.key} role="group" aria-label={t("newPlan.rows.box", { n: i + 1, label: box.label })} className="flex flex-wrap items-center gap-3">
                  <span className="w-36 opacity-70">{box.label}</span>
                  {box.options.map((o) => (
                    <label key={o} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`${field.key}-${i}-${box.key}`}
                        checked={r[box.key] === o}
                        disabled={disabled}
                        onChange={() => set(rows.map((x, j) => (j === i ? { ...x, [box.key]: o } : x)))}
                      />
                      {box.option_labels?.[o] ?? o}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  key={box.key}
                  className="rounded border px-2 py-1"
                  aria-label={t("newPlan.rows.box", { n: i + 1, label: box.label })}
                  placeholder={box.label}
                  value={r[box.key] ?? ""}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, [box.key]: e.target.value } : x)))}
                />
              ),
            )}
            <div>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => set(rows.filter((_, j) => j !== i))}>
                {t("newPlan.rows.remove", { n: i + 1 })}
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button size="sm" variant="outline" disabled={disabled || rows.length >= spec.max_rows} onClick={() => set([...rows, {}])}>
            {t("newPlan.rows.add")}
          </Button>
        </div>
        {rows.length > 0 && !drugOnDrugStudy && <span className="text-xs opacity-60">{t("newPlan.rows.mismatch")}</span>}
        <span className="text-xs opacity-60">{t("newPlan.rows.help", { max: spec.max_rows })}</span>
      </div>,
      true,
    );
  }

  // 제출서류 entries: one row each (name, version, date). R-BAY wants entries once a file is attached.
  if (field.kind === "docs") {
    const rows = docEntries(value);
    const set = (next: DocEntry[]) => onChange(next);
    const attached = Array.isArray(values["attachments.main"]) ? (values["attachments.main"] as string[]) : [];
    const missing = attached
      .flatMap((tok) => files.filter((f) => String(f.version_id) === tok))
      .map(entryFromFile)
      .filter((e) => !rows.some((r) => r.name === e.name));
    return row(
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            {(["name", "version", "date"] as const).map((part) => (
              <input
                key={part}
                className={`rounded border px-2 py-1 ${part === "name" ? "min-w-48 flex-1" : "w-36"}`}
                type={part === "date" ? "date" : "text"}
                aria-label={t(`newPlan.entry.${part}`, { n: i + 1 })}
                placeholder={t(`newPlan.entry.${part}Hint`)}
                value={r[part]}
                disabled={disabled}
                onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, [part]: e.target.value } : x)))}
              />
            ))}
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => set(rows.filter((_, j) => j !== i))}>
              {t("newPlan.entry.remove", { n: i + 1 })}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => set([...rows, { name: "", version: "", date: "" }])}>
            {t("newPlan.entry.add")}
          </Button>
          {missing.length > 0 && (
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => set([...rows, ...missing])}>
              {t("newPlan.entry.fromFiles", { count: missing.length })}
            </Button>
          )}
        </div>
        <span className="text-xs opacity-60">{t("newPlan.entry.help")}</span>
      </div>,
      true,
    );
  }

  if (field.kind === "radio")
    return row(
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-3">
        {field.options.map((o) => (
          <label key={o} className="flex items-center gap-1">
            <input type="radio" name={field.key} checked={text === o} disabled={disabled} onChange={() => onChange(o)} />
            {optionText(o)}
          </label>
        ))}
      </div>,
      true,
    );

  if (field.kind === "multi") {
    const blocked = blockedOptions(field, list); // R-BAY's own rules: a child needs its parent, one group at a time
    return row(
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-3">
        {field.options.map((o) => (
          <label key={o} className={`flex items-center gap-1 ${blocked.has(o) ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={list.includes(o)}
              disabled={disabled || blocked.has(o)}
              onChange={(e) => onChange(cleanMulti(field, e.target.checked ? [...list, o] : list.filter((x) => x !== o)))}
            />
            {optionText(o)}
          </label>
        ))}
      </div>,
      true,
    );
  }

  // A select R-BAY loads after another field (the disease subgroup): its list in Korean where it was read.
  const loaded = field.kind === "select" && field.dynamic_options ? dependentList(field, values) : null;
  if (loaded)
    return row(
      <select id={id} className="rounded border px-2 py-1" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {Object.entries(loaded).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>,
    );

  if (field.kind === "select" && !field.dynamic_options)
    return row(
      <>
        <select id={id} className="rounded border px-2 py-1" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {field.options.map((o) => (
            <option key={o} value={o}>
              {optionText(o)}
            </option>
          ))}
        </select>
        {help}
      </>,
    );

  if (field.kind === "textarea")
    return row(
      <>
        <textarea
          id={id}
          className="min-h-20 rounded border px-2 py-1"
          value={text}
          maxLength={field.max_length ?? undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {help}
      </>,
    );

  // text, lookup, date, and a select whose list R-BAY loads (typed as its code)
  const prefix = field.kind === "select" ? codePrefix(field, values) : null;
  return row(
    <>
      <input
        id={id}
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
    </>,
  );
}
