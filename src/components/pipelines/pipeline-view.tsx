"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { toUpload } from "@/lib/api/docgen";
import {
  MAX_PIPELINE_FILE,
  type PipelineDetail,
  type PipelineStatus,
  type PipelineStep,
  type StepChange,
  daysUntil,
  pipelineApi,
  sizeLabel,
  todaySeoul,
} from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;
type T = ReturnType<typeof useTranslations>;

export const detailKey = (id: number) => ["pipelines", "detail", id] as const;

function errorText(e: unknown, t: T): string {
  if (e instanceof ApiError) return e.status === 0 ? t("unreachable") : e.message || t("failed");
  return t("failed");
}

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
    >
      {message.text}
    </p>
  );
}

/** One change at a time with its own message; refreshes the pipeline after a success. */
function useChange() {
  const t = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  async function run(work: () => Promise<unknown>, ok: string | null): Promise<boolean> {
    setMessage(null);
    const done = await flight.run(async () => {
      try {
        await work();
        if (ok) setMessage({ kind: "ok", text: ok });
        await queryClient.invalidateQueries({ queryKey: ["pipelines"] });
        return true;
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, t) });
        return false;
      }
    });
    return done ?? false;
  }
  return { run, busy: flight.busy, message, setMessage };
}

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
  const live = d.steps.filter((s) => s.deleted_at === null);
  const gone = d.steps.filter((s) => s.deleted_at !== null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Link href={`/projects/${p.project_id}`} className="text-sm underline-offset-4 hover:underline">
          ← {t("backToProject")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title", { name: p.source_name ?? t("siteUnavailable") })}</h1>
        <p className="text-sm opacity-70">{t("progress", { closed: p.closed_steps, steps: p.steps })}</p>
        {!p.in_project && <p className="text-sm text-amber-700 dark:text-amber-300">{t("notInProjectNote")}</p>}
        {p.source_name === null && <p className="text-sm text-amber-700 dark:text-amber-300">{t("noAccessNote")}</p>}
        {removed && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            {t("removedNote")}
            <Button size="sm" variant="outline" disabled={change.busy} onClick={() => change.run(() => pipelineApi.restore(id), t("restored"))}>
              {t("restore")}
            </Button>
          </div>
        )}
        <Note message={change.message} />
      </header>

      <ol className="flex flex-col gap-4">
        {live.map((step, i) => (
          <StepCard key={step.id} pipelineId={id} step={step} statuses={d.statuses} index={i} order={live.map((s) => s.id)} readOnly={removed} />
        ))}
      </ol>

      {!removed && <AddStep pipelineId={id} types={d.step_types} />}

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
                  <span className="flex-1 opacity-70">{s.name}</span>
                  {!removed && (
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

      <History id={id} detail={d} />

      {!removed && <RemovePipeline id={id} />}
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

function StepCard({
  pipelineId,
  step,
  statuses,
  index,
  order,
  readOnly,
}: {
  pipelineId: number;
  step: PipelineStep;
  statuses: PipelineStatus[];
  index: number;
  order: number[];
  readOnly: boolean;
}) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [note, setNote] = useState(step.note);
  const [name, setName] = useState(step.name);
  const [confirming, setConfirming] = useState(false);
  const status = statuses.find((s) => s.key === step.status_key);
  const choices = statuses.filter((s) => !s.archived || s.key === step.status_key);
  const today = todaySeoul();
  const due = step.due_on && !status?.closed ? daysUntil(step.due_on, today) : null;
  const update = (c: StepChange) => change.run(() => pipelineApi.updateStep(pipelineId, step.id, c), null);
  const move = (by: -1 | 1) => {
    const ids = [...order];
    const to = index + by;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    return change.run(() => pipelineApi.reorder(pipelineId, ids), null);
  };
  const id = (part: string) => `step-${step.id}-${part}`;

  return (
    <li className="flex flex-col gap-3 rounded border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums opacity-60">{index + 1}.</span>
        {readOnly ? (
          <h2 className="font-medium">{step.name}</h2>
        ) : (
          <>
            <label className="sr-only" htmlFor={id("name")}>
              {t("stepName")}
            </label>
            <input
              id={id("name")}
              className="min-w-40 flex-1 rounded border px-2 py-1 font-medium"
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
        {status?.closed && <Check className="size-4 text-green-700" aria-label={t("finished")} />}
        {due !== null && (
          <span className={`rounded px-2 py-0.5 text-xs ${due < 0 ? "bg-red-100 text-red-800" : due <= 14 ? "bg-amber-100 text-amber-800" : "bg-neutral-100"}`}>
            {due < 0 ? t("overdue", { n: -due }) : t("dueIn", { n: due })}
          </span>
        )}
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
        <label htmlFor={id("note")}>{t("note")}</label>
        <textarea
          id={id("note")}
          className="rounded border px-2 py-1"
          rows={2}
          maxLength={4000}
          disabled={readOnly}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== step.note && update({ note })}
        />
      </div>

      {step.checklist.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">{t("checklist")}</h3>
          <ul className="flex flex-wrap gap-2">
            {step.checklist.map((c) => (
              <li
                key={c.name}
                className={`rounded px-2 py-0.5 text-xs ${c.uploaded ? "bg-green-100 text-green-900" : "bg-neutral-100 text-neutral-700"}`}
              >
                {c.uploaded ? "✓ " : "○ "}
                {c.name}
                <span className="sr-only">{c.uploaded ? t("uploaded") : t("missing")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Documents pipelineId={pipelineId} step={step} readOnly={readOnly} />
      {!readOnly && <Upload pipelineId={pipelineId} step={step} />}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {confirming ? (
            <>
              <span>{t("confirmRemoveStep")}</span>
              <Button size="sm" variant="destructive" disabled={change.busy} onClick={() => change.run(() => pipelineApi.removeStep(pipelineId, step.id), null)}>
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
        </div>
      )}
      <Note message={change.message} />
    </li>
  );
}

function Documents({ pipelineId, step, readOnly }: { pipelineId: number; step: PipelineStep; readOnly: boolean }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [open, setOpen] = useState<number | null>(null);
  const live = step.documents.filter((d) => d.deleted_at === null);
  const gone = step.documents.filter((d) => d.deleted_at !== null);

  async function download(documentId: number, versionNo: number) {
    await change.run(async () => {
      const { url } = await pipelineApi.downloadUrl(pipelineId, step.id, documentId, versionNo);
      window.location.assign(url);
    }, null);
  }

  if (step.documents.length === 0) return <p className="text-sm opacity-70">{t("noDocuments")}</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">{t("documents")}</h3>
      <ul className="flex flex-col gap-2">
        {live.map((doc) => {
          const latest = doc.versions[0];
          return (
            <li key={doc.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{doc.name}</span>
                {latest && (
                  <span className="opacity-70">
                    {t("versionLine", { n: latest.version_no, file: latest.filename, size: sizeLabel(latest.size_bytes) })}
                  </span>
                )}
                {latest && !latest.has_text && <span className="text-xs opacity-60">{t("noText")}</span>}
                <span className="ml-auto flex gap-1">
                  {latest && (
                    <Button size="sm" variant="outline" disabled={change.busy} onClick={() => download(doc.id, latest.version_no)} aria-label={t("downloadLatest", { name: doc.name })}>
                      <Download className="size-4" aria-hidden />
                    </Button>
                  )}
                  {doc.versions.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === doc.id ? null : doc.id)} aria-expanded={open === doc.id}>
                      {t("versions", { n: doc.versions.length })}
                    </Button>
                  )}
                  {!readOnly && (
                    <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => change.run(() => pipelineApi.setDocumentRemoved(pipelineId, step.id, doc.id, true), t("documentRemoved"))}>
                      {t("remove")}
                    </Button>
                  )}
                </span>
              </div>
              {open === doc.id && (
                <ul className="ml-4 flex flex-col gap-1">
                  {doc.versions.map((v) => (
                    <li key={v.version_no} className="flex items-center gap-2">
                      <span className="flex-1 opacity-80">
                        {t("versionLine", { n: v.version_no, file: v.filename, size: sizeLabel(v.size_bytes) })} · {v.created_at.slice(0, 10)}
                      </span>
                      <Button size="sm" variant="outline" disabled={change.busy} onClick={() => download(doc.id, v.version_no)} aria-label={t("downloadVersion", { name: doc.name, n: v.version_no })}>
                        <Download className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {gone.length > 0 && !readOnly && (
        <ul className="flex flex-col gap-1 text-xs opacity-80">
          {gone.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2">
              <span className="flex-1">{t("removedDocument", { name: doc.name })}</span>
              <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => change.run(() => pipelineApi.setDocumentRemoved(pipelineId, step.id, doc.id, false), t("restored"))}>
                {t("restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Note message={change.message} />
    </div>
  );
}

const TYPED = "__typed__";

function Upload({ pipelineId, step }: { pipelineId: number; step: PipelineStep }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const names = [
    ...step.checklist.map((c) => c.name),
    ...step.documents.filter((d) => d.deleted_at === null && !step.checklist.some((c) => c.name.toLowerCase() === d.name.toLowerCase())).map((d) => d.name),
  ];
  const [choice, setChoice] = useState(names[0] ?? TYPED);
  const [typed, setTyped] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [box, setBox] = useState(0);
  const id = `upload-${step.id}`;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const name = (choice === TYPED ? typed : choice).trim();
    if (!name) return change.setMessage({ kind: "error", text: t("needDocName") });
    if (!file) return change.setMessage({ kind: "error", text: t("needFile") });
    if (file.size === 0) return change.setMessage({ kind: "error", text: t("fileEmpty") });
    if (file.size > MAX_PIPELINE_FILE) return change.setMessage({ kind: "error", text: t("fileTooBig", { mb: MAX_PIPELINE_FILE / 1_000_000 }) });
    const ok = await change.run(async () => {
      const result = await pipelineApi.upload(pipelineId, step.id, name, await toUpload(file));
      change.setMessage({ kind: "ok", text: t("uploadedVersion", { name: result.document.name, n: result.version_no }) });
    }, null);
    if (ok) {
      setFile(null);
      setTyped("");
      setBox((n) => n + 1);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-wrap items-end gap-2 rounded bg-neutral-50 p-2 text-sm dark:bg-neutral-900">
      <label className="flex flex-col gap-1">
        {t("docName")}
        <select id={`${id}-name`} className="rounded border px-2 py-1" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={TYPED}>{t("otherName")}</option>
        </select>
      </label>
      {choice === TYPED && (
        <label className="flex flex-col gap-1">
          {t("typedName")}
          <input className="rounded border px-2 py-1" value={typed} maxLength={200} onChange={(e) => setTyped(e.target.value)} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        {t("file")}
        <input key={box} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Button type="submit" size="sm" disabled={change.busy} aria-busy={change.busy}>
        {change.busy && <Spinner aria-hidden />}
        {t("upload")}
      </Button>
      <div className="basis-full">
        <Note message={change.message} />
      </div>
    </form>
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

function History({ id, detail }: { id: number; detail: PipelineDetail }) {
  const t = useTranslations("pipelines");
  const [open, setOpen] = useState(false);
  const events = useQuery({ queryKey: ["pipelines", "history", id], queryFn: () => pipelineApi.history(id), enabled: open });
  const stepName = new Map(detail.steps.map((s) => [s.id, s.name]));
  return (
    <section className="flex flex-col gap-2 rounded border p-4 text-sm">
      <div>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("hideHistory") : t("history")}
        </Button>
      </div>
      {open && events.isLoading && <p className="opacity-70">{t("loading")}</p>}
      {events.isError && (
        <p role="alert" className="text-red-600">
          {errorText(events.error, t)}
        </p>
      )}
      {open && (
      <ol className="flex flex-col gap-1">
        {(events.data ?? []).map((e) => (
          <li key={e.id} className="flex flex-wrap gap-2">
            <time className="tabular-nums opacity-60" dateTime={e.created_at}>
              {e.created_at.slice(0, 16).replace("T", " ")}
            </time>
            <span>{t.has(`event.${eventKey(e.event_type)}`) ? t(`event.${eventKey(e.event_type)}`) : e.event_type}</span>
            {e.step_id !== null && stepName.has(e.step_id) && <span className="opacity-70">· {stepName.get(e.step_id)}</span>}
            {typeof e.payload.name === "string" && <span className="opacity-70">· {e.payload.name}</span>}
            {!e.mine && <span className="opacity-60">· {t("byOther")}</span>}
          </li>
        ))}
      </ol>
      )}
    </section>
  );
}

/** Message keys cannot contain dots: "step.added" -> "step_added". */
function eventKey(eventType: string): string {
  return eventType.replace(/\./g, "_");
}
