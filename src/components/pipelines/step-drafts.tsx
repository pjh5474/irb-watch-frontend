"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  AiOffBoxes,
  type Chosen,
  choiceOf,
  DocumentPicker,
  sourcesNeedingAgreement,
} from "@/components/drafts/document-picker";
import { DraftJobLines, JOBS_KEY } from "@/components/drafts/draft-jobs";
import { errorText } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { type Draft, type DraftJob, MAX_INSTRUCTION_CHARS, docgenApi, isOpenJob } from "@/lib/api/docgen";
import { type DraftInputs, type PipelineStep, pipelineApi } from "@/lib/api/pipelines";
import { pickerSourcesOfHospital } from "@/lib/draft-picker";
import { useSingleFlight } from "@/lib/use-single-flight";

/**
 * The AI drafts of one pipeline step: the drafts made so far (newest first), the job being
 * written or the reason the last one failed, and the "Draft for this step" dialog. A draft is
 * a background job: it goes on if the user leaves, and the step shows its state. The drafts
 * and jobs come with the step page (one call).
 */
export function StepDrafts({
  pipelineId,
  step,
  drafts,
  jobs,
  readOnly,
}: {
  pipelineId: number;
  step: PipelineStep;
  drafts: Draft[];
  jobs: DraftJob[];
  readOnly: boolean;
}) {
  const t = useTranslations("pipelines");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // One open draft per step (the server's rule); a revision of one of its drafts does not block.
  const writing = jobs.some((j) => isOpenJob(j) && j.kind === "draft");

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="font-medium">{t("drafts.title")}</h2>
      {drafts.length === 0 && jobs.length === 0 && <p className="opacity-70">{t("drafts.none")}</p>}
      {drafts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/drafts/${d.id}`} className="underline underline-offset-4">
                {d.title || t("drafts.untitled")}
              </Link>
              <span className="text-xs opacity-60">
                {format.dateTime(new Date(d.updated_at), { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <DraftJobLines jobs={jobs} />
      {message && (
        <p role="status" className="text-green-700 dark:text-green-400">
          {message}
        </p>
      )}
      {!readOnly && !open && (
        <div>
          <Button size="sm" variant="outline" disabled={writing} onClick={() => { setMessage(null); setOpen(true); }}>
            {t("drafts.start")}
          </Button>
        </div>
      )}
      {open && (
        <StepDraftDialog
          pipelineId={pipelineId}
          step={step}
          onClose={() => setOpen(false)}
          onStarted={() => {
            setOpen(false);
            setMessage(t("drafts.started"));
          }}
        />
      )}
    </section>
  );
}

function StepDraftDialog({
  pipelineId,
  step,
  onClose,
  onStarted,
}: {
  pipelineId: number;
  step: PipelineStep;
  onClose: () => void;
  onStarted: () => void;
}) {
  const t = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  // Asked fresh each time the dialog opens: files may have been uploaded since.
  const inputs = useQuery({
    queryKey: ["pipelines", "draft-inputs", pipelineId, step.id],
    queryFn: () => pipelineApi.draftInputs(pipelineId, step.id),
    gcTime: 0,
  });

  if (inputs.isLoading) return <p className="opacity-70">{t("loading")}</p>;
  if (inputs.isError || !inputs.data)
    return (
      <div className="flex flex-col gap-2 rounded border p-3">
        <p role="alert" className="text-red-600">
          {errorText(inputs.error, t)}
        </p>
        <div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  return (
    <DialogForm
      inputs={inputs.data}
      busy={flight.busy}
      onClose={onClose}
      onStart={async (body) => {
        let error: string | null = null;
        await flight.run(async () => {
          try {
            await docgenApi.startStepDraft(step.id, body);
            // The step page (its jobs), the overview's counts, the Drafts page's job list.
            await queryClient.invalidateQueries({ queryKey: ["pipelines"] });
            await queryClient.invalidateQueries({ queryKey: JOBS_KEY });
            await queryClient.invalidateQueries({ queryKey: ["docgen", "status"] });
            onStarted();
          } catch (e) {
            error = errorText(e, t);
          }
        });
        return error;
      }}
    />
  );
}

type StartBody = Parameters<typeof docgenApi.startStepDraft>[1];

function DialogForm({
  inputs,
  busy,
  onClose,
  onStart,
}: {
  inputs: DraftInputs;
  busy: boolean;
  onClose: () => void;
  onStart: (body: StartBody) => Promise<string | null>;
}) {
  const t = useTranslations("pipelines");
  const [ticked, setTicked] = useState<Set<number>>(
    () => new Set(inputs.files.filter((f) => f.ticked).map((f) => f.document_id)),
  );
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [agreed, setAgreed] = useState<Set<number>>(new Set());
  const [useForm, setUseForm] = useState(inputs.form_template_id !== null);
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);

  const boards = useQuery({
    queryKey: ["picker", "hospital-sources", inputs.hospital_id],
    queryFn: () => pickerSourcesOfHospital(inputs.hospital_id),
    enabled: inputs.allow_board_documents,
  });
  const byId = useMemo(() => new Map((boards.data ?? []).map((s) => [s.id, s])), [boards.data]);
  const names = useMemo(() => new Map((boards.data ?? []).map((s) => [s.id, s.name])), [boards.data]);
  const aiEnabled = useMemo(() => new Map((boards.data ?? []).map((s) => [s.id, s.ai_enabled])), [boards.data]);
  const aiOff = sourcesNeedingAgreement(chosen.map((c) => c.source_id), [], aiEnabled);
  const missingAgree = aiOff.some((s) => !agreed.has(s));

  const sending = inputs.files.filter((f) => ticked.has(f.document_id));
  const nothing = sending.length === 0 && chosen.length === 0;

  const toggle = (id: number, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (nothing || missingAgree || busy) return;
    setError(
      await onStart({
        step_files: sending.map((f) => ({ document_id: f.document_id, version_no: f.version_no })),
        documents: chosen.map(choiceOf),
        guide_ids: null, // the hospital's guides and the step type's
        extra_guides: [],
        instruction: request.trim(),
        ai_override_source_ids: aiOff.filter((s) => agreed.has(s)),
        template_id: useForm ? inputs.form_template_id : null,
      }),
    );
  }

  return (
    <form onSubmit={start} className="flex flex-col gap-3 rounded border p-3" aria-label={t("drafts.start")}>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">{t("drafts.files")}</legend>
        {inputs.files.length === 0 && <p className="opacity-70">{t("drafts.noFiles")}</p>}
        {inputs.files.map((f) => (
          <label key={f.document_id} className={`flex flex-wrap items-center gap-2 ${f.has_text ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={ticked.has(f.document_id)}
              disabled={!f.has_text}
              onChange={(e) => toggle(f.document_id, e.target.checked)}
            />
            <span>{f.name}</span>
            <span className="text-xs opacity-70">
              {t("drafts.fileOf", { step: f.step_name, n: f.version_no, file: f.filename })}
            </span>
            {!f.has_text && <span className="text-xs">{t("drafts.noText", { reason: f.text_note ?? "" })}</span>}
          </label>
        ))}
      </fieldset>

      {inputs.allow_board_documents && (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t("drafts.boardDocuments")}</legend>
          {boards.isError && (
            <p role="alert" className="text-red-600">
              {t("failed")}
            </p>
          )}
          {boards.data?.length === 0 && <p className="opacity-70">{t("drafts.noBoards")}</p>}
          {!!boards.data?.length && (
            <DocumentPicker chosen={chosen} onChange={setChosen} sources={boards.data} byId={byId} initialSource={boards.data[0].id} />
          )}
          <AiOffBoxes sourceIds={aiOff} names={names} agreed={agreed} onChange={setAgreed} />
        </fieldset>
      )}

      {inputs.form_template_id !== null && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={useForm} onChange={(e) => setUseForm(e.target.checked)} />
          {t("drafts.useForm")}
        </label>
      )}
      <p className="text-xs opacity-70">
        {t(inputs.has_instructions ? "drafts.settingsWithInstructions" : "drafts.settings")}
      </p>

      <label className="flex flex-col gap-1">
        {t("drafts.request")}
        <textarea
          className="min-h-16 rounded border px-3 py-2"
          value={request}
          maxLength={MAX_INSTRUCTION_CHARS}
          onChange={(e) => setRequest(e.target.value)}
        />
      </label>

      {/* The consent: the dialog names every own file that goes to the AI service. */}
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
        {sending.length > 0
          ? t("drafts.consent", { files: sending.map((f) => `${f.name} (${f.filename})`).join(", ") })
          : t("drafts.consentNone")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={nothing || missingAgree || busy} aria-busy={busy}>
          {busy && <Spinner aria-hidden />}
          {t("drafts.startNow")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        {nothing && <span className="text-xs opacity-70">{t("drafts.chooseSomething")}</span>}
        {!nothing && missingAgree && <span className="text-xs text-amber-700">{t("drafts.needAgree")}</span>}
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
