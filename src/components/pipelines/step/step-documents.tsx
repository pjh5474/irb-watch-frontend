"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Note, useChange } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toUpload } from "@/lib/api/docgen";
import { MAX_PIPELINE_FILE, type StepPage, pipelineApi, sizeLabel } from "@/lib/api/pipelines";

type Props = { pipelineId: number; page: StepPage; readOnly: boolean };

/** The step's checklist, its documents with every version, removed documents, and the upload form. */
export function StepDocuments({ pipelineId, page, readOnly }: Props) {
  const t = useTranslations("pipelines");
  return (
    <section className="flex flex-col gap-3 text-sm">
      <h2 className="font-medium">{t("documents")}</h2>
      {page.checklist.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="opacity-80">{t("checklist")}</h3>
          <ul className="flex flex-wrap gap-2">
            {page.checklist.map((c) => (
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
      <Documents pipelineId={pipelineId} page={page} readOnly={readOnly} />
      {!readOnly && <Upload key={page.step.id} pipelineId={pipelineId} page={page} />}
    </section>
  );
}

function Documents({ pipelineId, page, readOnly }: Props) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [open, setOpen] = useState<number | null>(null);
  const stepId = page.step.id;
  const live = page.documents.filter((d) => d.deleted_at === null);
  const gone = page.documents.filter((d) => d.deleted_at !== null);

  async function download(documentId: number, versionNo: number) {
    await change.run(async () => {
      const { url } = await pipelineApi.downloadUrl(pipelineId, stepId, documentId, versionNo);
      window.location.assign(url);
    }, null);
  }

  if (page.documents.length === 0) return <p className="opacity-70">{t("noDocuments")}</p>;
  return (
    <div className="flex flex-col gap-2">
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
                    <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => change.run(() => pipelineApi.setDocumentRemoved(pipelineId, stepId, doc.id, true), t("documentRemoved"))}>
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
              <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => change.run(() => pipelineApi.setDocumentRemoved(pipelineId, stepId, doc.id, false), t("restored"))}>
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

function Upload({ pipelineId, page }: { pipelineId: number; page: StepPage }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const names = [
    ...page.checklist.map((c) => c.name),
    ...page.documents
      .filter((d) => d.deleted_at === null && !page.checklist.some((c) => c.name.toLowerCase() === d.name.toLowerCase()))
      .map((d) => d.name),
  ];
  const [choice, setChoice] = useState(names[0] ?? TYPED);
  const [typed, setTyped] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [box, setBox] = useState(0);
  const id = `upload-${page.step.id}`;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const name = (choice === TYPED ? typed : choice).trim();
    if (!name) return change.setMessage({ kind: "error", text: t("needDocName") });
    if (!file) return change.setMessage({ kind: "error", text: t("needFile") });
    if (file.size === 0) return change.setMessage({ kind: "error", text: t("fileEmpty") });
    if (file.size > MAX_PIPELINE_FILE) return change.setMessage({ kind: "error", text: t("fileTooBig", { mb: MAX_PIPELINE_FILE / 1_000_000 }) });
    const ok = await change.run(async () => {
      const result = await pipelineApi.upload(pipelineId, page.step.id, name, await toUpload(file));
      change.setMessage({ kind: "ok", text: t("uploadedVersion", { name: result.document.name, n: result.version_no }) });
    }, null);
    if (ok) {
      setFile(null);
      setTyped("");
      setBox((n) => n + 1);
    }
  }

  return (
    <form onSubmit={send} aria-label={t("uploadTitle")} className="flex flex-wrap items-end gap-2 rounded bg-neutral-50 p-2 dark:bg-neutral-900">
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
