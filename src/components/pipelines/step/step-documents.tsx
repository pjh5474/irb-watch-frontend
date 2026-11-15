"use client";

import { ArrowDown, ArrowUp, Download, Upload as UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Note, useChange } from "@/components/pipelines/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toUpload } from "@/lib/api/docgen";
import {
  DOC_SECTIONS,
  type DocSection,
  type DocStatus,
  MAX_PIPELINE_FILE,
  type StepDocument,
  type StepPage,
  pipelineApi,
  sizeLabel,
} from "@/lib/api/pipelines";

type Props = { pipelineId: number; page: StepPage; readOnly: boolean };

// The page shows three groups, like the real folders: 신청서 및 통지서 (the application and what
// the IRB sends back), 제출서류, 참고자료.
const GROUPS: { key: string; title: string; sections: DocSection[] }[] = [
  { key: "application", title: "sectionApplication", sections: ["application", "received"] },
  { key: "submission", title: "sectionSubmission", sections: ["submission"] },
  { key: "reference", title: "sectionReference", sections: ["reference"] },
];

const sectionOf = (d: StepDocument): DocSection => d.section ?? "submission";
const statusOf = (d: StepDocument): DocStatus => d.status ?? (d.versions.length ? "in_progress" : "needed");

/** Live slots in the page's order: by section (DOC_SECTIONS), then as the server sent them. */
export function orderedSlots(docs: StepDocument[]): StepDocument[] {
  const live = docs.filter((d) => d.deleted_at === null);
  return DOC_SECTIONS.flatMap((s) => live.filter((d) => sectionOf(d) === s));
}

/** Names of required slots not yet done (for the "submitted" confirmation). */
export function missingRequired(page: StepPage): string[] {
  return page.checklist.filter((c) => !c.done).map((c) => c.name);
}

const STATUS_STYLE: Record<DocStatus, string> = {
  needed: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  final: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  not_needed: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

/** The step's checklist, its document slots by section with every version, and "Add a document". */
export function StepDocuments({ pipelineId, page, readOnly }: Props) {
  const t = useTranslations("pipelines");
  const done = page.checklist.filter((c) => c.done).length;
  return (
    <section className="flex flex-col gap-3 text-sm">
      <h2 className="font-medium">{t("documents")}</h2>
      {page.checklist.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="opacity-80">
            {t("checklist")} · {t("checklistProgress", { done, total: page.checklist.length })}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {page.checklist.map((c) => (
              <li key={c.document_id ?? c.name} className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>
                {c.done ? "✓ " : "○ "}
                {c.name}
                <span className="sr-only"> ({t(`docStatus_${c.status}`)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Slots pipelineId={pipelineId} page={page} readOnly={readOnly} />
      {!readOnly && <AddDocument key={page.step.id} pipelineId={pipelineId} page={page} />}
    </section>
  );
}

function Slots({ pipelineId, page, readOnly }: Props) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const stepId = page.step.id;
  const live = orderedSlots(page.documents);
  const gone = page.documents.filter((d) => d.deleted_at !== null);

  async function move(doc: StepDocument, by: -1 | 1) {
    const same = live.filter((d) => sectionOf(d) === sectionOf(doc));
    const other = same[same.findIndex((d) => d.id === doc.id) + by];
    if (!other) return;
    const ids = live.map((d) => d.id);
    const i = ids.indexOf(doc.id);
    const j = ids.indexOf(other.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await change.run(() => pipelineApi.reorderDocuments(pipelineId, stepId, ids), null);
  }

  if (page.documents.length === 0) return <p className="opacity-70">{t("noDocuments")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((group) => {
        const rows = live.filter((d) => group.sections.includes(sectionOf(d)));
        if (rows.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium opacity-70">{t(group.title)}</h3>
            <ul className="flex flex-col divide-y rounded border">
              {rows.map((doc) => {
                const same = live.filter((d) => sectionOf(d) === sectionOf(doc));
                const at = same.findIndex((d) => d.id === doc.id);
                return (
                  <Slot
                    key={doc.id}
                    pipelineId={pipelineId}
                    stepId={stepId}
                    doc={doc}
                    readOnly={readOnly}
                    busy={change.busy}
                    onMove={same.length > 1 ? (by) => move(doc, by) : undefined}
                    first={at === 0}
                    last={at === same.length - 1}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}
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

type SlotProps = {
  pipelineId: number;
  stepId: number;
  doc: StepDocument;
  readOnly: boolean;
  busy: boolean;
  onMove?: (by: -1 | 1) => void;
  first: boolean;
  last: boolean;
};

/** One slot: name, flags and status, the newest file, every version, and its actions. */
function Slot({ pipelineId, stepId, doc, readOnly, busy, onMove, first, last }: SlotProps) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const latest = doc.versions[0];
  const status = statusOf(doc);
  const disabled = busy || change.busy;

  async function download(versionNo: number) {
    await change.run(async () => {
      const { url } = await pipelineApi.downloadUrl(pipelineId, stepId, doc.id, versionNo);
      window.location.assign(url);
    }, null);
  }

  async function upload(file: File | undefined) {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    if (file.size === 0) return change.setMessage({ kind: "error", text: t("fileEmpty") });
    if (file.size > MAX_PIPELINE_FILE) return change.setMessage({ kind: "error", text: t("fileTooBig", { mb: MAX_PIPELINE_FILE / 1_000_000 }) });
    await change.run(async () => {
      const result = await pipelineApi.upload(pipelineId, stepId, doc.name, await toUpload(file), doc.id);
      change.setMessage({ kind: "ok", text: t("uploadedVersion", { name: result.document.name, n: result.version_no }) });
    }, null);
  }

  const setStatus = (next: DocStatus, ok: string) =>
    change.run(() => pipelineApi.updateDocument(pipelineId, stepId, doc.id, { status: next }), ok);
  const uploadLabel = latest ? t("uploadNewVersion") : t("uploadFile");

  return (
    <li className="flex flex-col gap-1 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{doc.name}</span>
        {doc.required && <span className="rounded border px-1.5 text-xs">{t("required")}</span>}
        {sectionOf(doc) === "received" && <span className="text-xs opacity-70">{t("fromIrb")}</span>}
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{t(`docStatus_${status}`)}</span>
        {!readOnly && (
          <span className="ml-auto flex flex-wrap gap-1">
            <input
              ref={picker}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label={`${uploadLabel}: ${doc.name}`}
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => picker.current?.click()}>
              {change.busy ? <Spinner aria-hidden /> : <UploadIcon className="size-4" aria-hidden />}
              {uploadLabel}
            </Button>
            {latest && status !== "final" && (
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => setStatus("final", t("markedFinal"))}>
                {t("markFinal")}
              </Button>
            )}
            {status !== "not_needed" && status !== "final" && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setStatus("not_needed", t("markedNotNeeded"))}>
                {t("markNotNeeded")}
              </Button>
            )}
            {(status === "final" || status === "not_needed") && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setStatus("needed", t("reopened"))}>
                {t("reopen")}
              </Button>
            )}
            {onMove && (
              <>
                <Button size="sm" variant="ghost" disabled={disabled || first} onClick={() => onMove(-1)} aria-label={t("moveUp", { name: doc.name })}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" disabled={disabled || last} onClick={() => onMove(1)} aria-label={t("moveDown", { name: doc.name })}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
              </>
            )}
            {/* A listed document stays (owner): it is marked not needed instead. */}
            {!doc.listed && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => change.run(() => pipelineApi.setDocumentRemoved(pipelineId, stepId, doc.id, true), t("documentRemoved"))}>
                {t("remove")}
              </Button>
            )}
          </span>
        )}
      </div>
      {latest && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="opacity-70">{t("versionLine", { n: latest.version_no, file: latest.filename, size: sizeLabel(latest.size_bytes) })}</span>
          {!latest.has_text && <span className="opacity-60">{t("noText")}</span>}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => download(latest.version_no)} aria-label={t("downloadLatest", { name: doc.name })}>
            <Download className="size-4" aria-hidden />
          </Button>
          {doc.versions.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
              {t("versions", { n: doc.versions.length })}
            </Button>
          )}
        </div>
      )}
      {open && (
        <ul className="ml-4 flex flex-col gap-1 text-xs">
          {doc.versions.map((v) => (
            <li key={v.version_no} className="flex items-center gap-2">
              <span className="flex-1 opacity-80">
                {t("versionLine", { n: v.version_no, file: v.filename, size: sizeLabel(v.size_bytes) })} · {v.created_at.slice(0, 10)}
              </span>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => download(v.version_no)} aria-label={t("downloadVersion", { name: doc.name, n: v.version_no })}>
                <Download className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Note message={change.message} />
    </li>
  );
}

/** A document of the user's own (no file yet); its file is uploaded in its row. */
function AddDocument({ pipelineId, page }: { pipelineId: number; page: StepPage }) {
  const t = useTranslations("pipelines");
  const change = useChange();
  const [name, setName] = useState("");
  const [section, setSection] = useState<DocSection>("submission");
  const id = `add-doc-${page.step.id}`;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return change.setMessage({ kind: "error", text: t("needDocName") });
    const ok = await change.run(() => pipelineApi.addDocument(pipelineId, page.step.id, clean, section), t("documentAdded", { name: clean }));
    if (ok) setName("");
  }

  return (
    <form onSubmit={send} aria-label={t("addDocumentTitle")} className="flex flex-wrap items-end gap-2 rounded bg-neutral-50 p-2 dark:bg-neutral-900">
      <label className="flex flex-col gap-1" htmlFor={`${id}-name`}>
        {t("docName")}
        <input id={`${id}-name`} className="rounded border px-2 py-1" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1" htmlFor={`${id}-section`}>
        {t("section")}
        <select id={`${id}-section`} className="rounded border px-2 py-1" value={section} onChange={(e) => setSection(e.target.value as DocSection)}>
          {DOC_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`sectionOption_${s}`)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={change.busy} aria-busy={change.busy}>
        {change.busy && <Spinner aria-hidden />}
        {t("addDocument")}
      </Button>
      <div className="basis-full">
        <Note message={change.message} />
      </div>
    </form>
  );
}
