"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SOURCES_KEY } from "@/components/admin/admin-sources";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { adminApi, type AdminSource, type ManualResult } from "@/lib/api/admin";
import { toUpload } from "@/lib/api/docgen";
import { createClient } from "@/lib/supabase/client";
import { useSingleFlight } from "@/lib/use-single-flight";

// A manual source's documents: an admin uploads a hospital's documents by hand. Each save is
// a version like a scanned change (card, AI summary if on). Saved versions cannot be deleted,
// so the page shows what will change and asks to confirm before sending.

export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 20_000_000; // the server checks again (MAX_FILE_BYTES there)
export const MAX_UPLOAD_BYTES = 60_000_000;

type DocRow = {
  id: number;
  title: string;
  posted_on: string | null;
  status: string;
  review_reason: string | null;
  latest_version_id: number | null;
};
type FileRow = { filename: string; size_label: string | null; hash_only_reason: string | null };
type Message = { kind: "ok" | "error"; text: string } | null;

const docsKey = (sourceId: number) => ["admin", "manual-docs", sourceId];

async function loadDocuments(sourceId: number): Promise<DocRow[]> {
  const { data, error } = await createClient()
    .from("documents")
    .select("id, title, posted_on, status, review_reason, latest_version_id")
    .eq("source_id", sourceId)
    .order("posted_on", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadVersion(versionId: number): Promise<{ note: string; files: FileRow[] }> {
  const supabase = createClient();
  const [version, files] = await Promise.all([
    supabase.from("document_versions").select("body_text").eq("id", versionId).maybeSingle(),
    supabase
      .from("document_version_files")
      .select("filename, size_label, hash_only_reason")
      .eq("version_id", versionId)
      .order("filename"),
  ]);
  if (version.error) throw new Error(version.error.message);
  if (files.error) throw new Error(files.error.message);
  return { note: version.data?.body_text ?? "", files: files.data ?? [] };
}

/** Top-level files only: files inside a zip ("a.zip/x.pdf") come and go with their zip. */
export function topLevel(files: { filename: string }[]): string[] {
  return files.map((f) => f.filename).filter((n) => !n.includes("/"));
}

/** Why these files cannot be sent, as a message key with values; null when fine. */
export function filesProblem(files: File[]): { key: string; values?: Record<string, string | number> } | null {
  if (files.length > MAX_FILES) return { key: "manual.tooManyFiles", values: { max: MAX_FILES } };
  const names = new Set<string>();
  let total = 0;
  for (const f of files) {
    if (f.size === 0) return { key: "manual.fileEmpty", values: { name: f.name } };
    if (f.size > MAX_FILE_BYTES) return { key: "manual.fileTooBig", values: { name: f.name, mb: MAX_FILE_BYTES / 1_000_000 } };
    if (names.has(f.name)) return { key: "manual.sameName", values: { name: f.name } };
    names.add(f.name);
    total += f.size;
  }
  if (total > MAX_UPLOAD_BYTES) return { key: "manual.tooBigTogether", values: { mb: MAX_UPLOAD_BYTES / 1_000_000 } };
  return null;
}

export type Plan = {
  title: string | null; // the new title, when it changes
  note: boolean; // the note changes
  date: string | null | undefined; // undefined: unchanged; null: cleared
  kept: string[];
  removed: string[];
  replaced: string[];
  added: string[];
};

/** What a new version changes, for the confirm step. */
export function planVersion(
  current: { title: string; note: string; posted_on: string | null; files: string[] },
  next: { title: string; note: string; posted_on: string; keep: Set<string>; files: File[] },
): Plan {
  const uploads = next.files.map((f) => f.name);
  const kept = current.files.filter((n) => next.keep.has(n) && !uploads.includes(n));
  const date = (next.posted_on || null) === current.posted_on ? undefined : next.posted_on || null;
  return {
    title: next.title.trim() !== current.title ? next.title.trim() : null,
    note: next.note.trim() !== current.note.trim(),
    date,
    kept,
    removed: current.files.filter((n) => !next.keep.has(n) && !uploads.includes(n)),
    replaced: uploads.filter((n) => current.files.includes(n)),
    added: uploads.filter((n) => !current.files.includes(n)),
  };
}

export function planIsEmpty(p: Plan): boolean {
  return p.title === null && !p.note && p.date === undefined && !p.removed.length && !p.replaced.length && !p.added.length;
}

function resultText(t: ReturnType<typeof useTranslations>, r: ManualResult): string {
  const base = t(`manual.result.${r.change}` as "manual.result.new", { n: r.version_no });
  return r.warnings.length ? `${base} ${t("manual.withWarnings", { list: r.warnings.join("; ") })}` : base;
}

export function ManualDocuments({ source }: { source: AdminSource }) {
  const t = useTranslations("admin");
  const docs = useQuery({ queryKey: docsKey(source.id), queryFn: () => loadDocuments(source.id) });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // A save closes its editor and says what happened at the top of the list.
  const done = (text: string) => {
    setAdding(false);
    setOpen(null);
    setSaved(text);
  };

  return (
    <Section icon={FileUp} accent="blue" title={t("manual.title")}>
      <p className="text-sm opacity-80">{t("manual.intro")}</p>
      {!source.is_active && <p className="text-sm text-amber-700">{t("manual.inactive")}</p>}
      {saved && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {saved}
        </p>
      )}
      {adding ? (
        <NewDocument source={source} onSaved={done} onCancel={() => setAdding(false)} />
      ) : (
        <div>
          <Button
            size="sm"
            disabled={!source.is_active}
            onClick={() => {
              setSaved(null);
              setAdding(true);
            }}
          >
            {t("manual.newDocument")}
          </Button>
        </div>
      )}
      {docs.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {docs.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(docs.error, t)}
        </p>
      )}
      {docs.data?.length === 0 && <p className="text-sm opacity-70">{t("manual.empty")}</p>}
      <ul className="flex flex-col divide-y">
        {docs.data?.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/documents/${d.id}`} className="font-medium break-words underline-offset-4 hover:underline">
                {d.title}
              </Link>
              {d.posted_on && <span className="opacity-60">{d.posted_on}</span>}
              {d.status === "removed" && <Badge>{t("manual.removedBadge")}</Badge>}
              {d.status === "needs_review" && <Badge tone="warn">{t("manual.needsReview")}</Badge>}
              <span className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant={open === d.id ? "default" : "ghost"}
                  disabled={!source.is_active}
                  aria-expanded={open === d.id}
                  onClick={() => {
                    setSaved(null);
                    setOpen(open === d.id ? null : d.id);
                  }}
                >
                  {d.status === "removed" ? t("manual.restoreMenu") : t("manual.newVersion")}
                </Button>
              </span>
            </div>
            {d.status === "needs_review" && d.review_reason && (
              <p className="text-xs text-amber-800 dark:text-amber-200">{d.review_reason}</p>
            )}
            {open === d.id &&
              (d.status === "removed" ? (
                <RemoveBox source={source} doc={d} removed onSaved={done} onCancel={() => setOpen(null)} />
              ) : (
                <VersionEditor source={source} doc={d} onSaved={done} onCancel={() => setOpen(null)} />
              ))}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function useAfterSave(source: AdminSource) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey(source.id) });
    await queryClient.invalidateQueries({ queryKey: ["admin", "manual-version"] });
    await queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
  };
}

function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        {t("manual.addFiles")}
        <input
          type="file"
          multiple
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <span className="text-xs opacity-70">{t("manual.filesHint", { max: MAX_FILES, mb: MAX_FILE_BYTES / 1_000_000 })}</span>
      </label>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 break-all">{f.name}</span>
              <span className="text-xs opacity-60">{(f.size / 1_000_000).toFixed(2)} MB</span>
              <Button size="sm" variant="ghost" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                {t("manual.drop")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Done = { onSaved: (text: string) => void; onCancel: () => void };

function NewDocument({ source, onSaved, onCancel }: { source: AdminSource } & Done) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const afterSave = useAfterSave(source);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const problem = filesProblem(files);

  async function save() {
    setMessage(null);
    await flight.run(async () => {
      try {
        const r = await adminApi.manualCreateDocument(source.id, {
          title: title.trim(),
          note,
          posted_on: date || null,
          files: await Promise.all(files.map(toUpload)),
        });
        await afterSave();
        onSaved(resultText(t, r));
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3 text-sm">
      <h3 className="font-medium">{t("manual.newDocument")}</h3>
      <label className="flex flex-col gap-1">
        {t("manual.docTitle")}
        <input className="rounded border px-3 py-2" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {t("manual.postedOn")}
        <input type="date" className="w-48 rounded border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {t("manual.note")}
        <textarea className="min-h-20 rounded border p-2" value={note} maxLength={20_000} onChange={(e) => setNote(e.target.value)} />
        <span className="text-xs opacity-70">{t("manual.noteHint")}</span>
      </label>
      <FilePicker files={files} onChange={(f) => { setFiles(f); setConfirming(false); }} />
      {problem && <p role="alert" className="text-red-600">{t(problem.key as "manual.tooManyFiles", problem.values)}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">{t("manual.confirmTitle")}</p>
          <ul className="list-disc pl-5">
            <li>{t("manual.planNew", { title: title.trim() })}</li>
            <li>{date ? t("manual.planDate", { date }) : t("manual.planNoDate")}</li>
            {files.map((f) => (
              <li key={f.name}>{t("manual.planAdded", { name: f.name })}</li>
            ))}
            {files.length === 0 && <li>{t("manual.planNoFiles")}</li>}
          </ul>
          <p className="text-xs">{t("manual.permanent")}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={flight.busy} aria-busy={flight.busy} onClick={() => void save()}>
              {flight.busy && <Spinner aria-hidden />}
              {t("manual.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("manual.back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={!title.trim() || !!problem} onClick={() => setConfirming(true)}>
            {t("manual.review")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      )}
      <Note message={message} />
    </div>
  );
}

function VersionEditor({ source, doc, onSaved, onCancel }: { source: AdminSource; doc: DocRow } & Done) {
  const t = useTranslations("admin");
  const current = useQuery({
    queryKey: ["admin", "manual-version", doc.latest_version_id],
    queryFn: () => loadVersion(doc.latest_version_id!),
    enabled: doc.latest_version_id !== null,
  });
  if (current.isLoading) return <p className="opacity-70">{t("loading")}</p>;
  if (current.isError || !current.data)
    return (
      <p role="alert" className="text-red-600">
        {adminErrorText(current.error, t)}
      </p>
    );
  return (
    <VersionForm
      source={source}
      doc={doc}
      note={current.data.note}
      files={topLevel(current.data.files)}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function VersionForm({
  source,
  doc,
  note: currentNote,
  files: currentFiles,
  onSaved,
  onCancel,
}: {
  source: AdminSource;
  doc: DocRow;
  note: string;
  files: string[];
} & Done) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const afterSave = useAfterSave(source);
  const [title, setTitle] = useState(doc.title);
  const [note, setNote] = useState(currentNote);
  const [date, setDate] = useState(doc.posted_on ?? "");
  const [keep, setKeep] = useState<Set<string>>(new Set(currentFiles));
  const [files, setFiles] = useState<File[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const problem = filesProblem(files);
  const plan = planVersion(
    { title: doc.title, note: currentNote, posted_on: doc.posted_on, files: currentFiles },
    { title, note, posted_on: date, keep, files },
  );
  const empty = planIsEmpty(plan);

  async function save() {
    setMessage(null);
    await flight.run(async () => {
      try {
        const r = await adminApi.manualAddVersion(source.id, doc.id, {
          title: plan.title,
          note: plan.note ? note : null,
          posted_on: plan.date === undefined ? null : (plan.date ?? ""),
          keep_files: plan.kept,
          files: await Promise.all(files.map(toUpload)),
        });
        await afterSave();
        onSaved(resultText(t, r));
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
        setConfirming(false);
      }
    });
  }

  if (removing) {
    return <RemoveBox source={source} doc={doc} removed={false} onSaved={onSaved} onCancel={() => setRemoving(false)} />;
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <label className="flex flex-col gap-1">
        {t("manual.docTitle")}
        <input className="rounded border px-3 py-2" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {t("manual.postedOn")}
        <input type="date" className="w-48 rounded border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {t("manual.note")}
        <textarea className="min-h-20 rounded border p-2" value={note} maxLength={20_000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">{t("manual.currentFiles")}</legend>
        {currentFiles.length === 0 && <p className="opacity-70">{t("manual.noFiles")}</p>}
        {currentFiles.map((name) => (
          <label key={name} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keep.has(name)}
              onChange={(e) => {
                const next = new Set(keep);
                if (e.target.checked) next.add(name);
                else next.delete(name);
                setKeep(next);
                setConfirming(false);
              }}
            />
            <span className="break-all">{name}</span>
          </label>
        ))}
        <span className="text-xs opacity-70">{t("manual.keepHint")}</span>
      </fieldset>
      <FilePicker files={files} onChange={(f) => { setFiles(f); setConfirming(false); }} />
      {problem && <p role="alert" className="text-red-600">{t(problem.key as "manual.tooManyFiles", problem.values)}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">{t("manual.confirmTitle")}</p>
          <ul className="list-disc pl-5">
            {plan.title !== null && <li>{t("manual.planTitle", { title: plan.title })}</li>}
            {plan.note && <li>{t("manual.planNote")}</li>}
            {plan.date !== undefined && <li>{plan.date ? t("manual.planDate", { date: plan.date }) : t("manual.planNoDate")}</li>}
            {plan.replaced.map((n) => <li key={`r-${n}`}>{t("manual.planReplaced", { name: n })}</li>)}
            {plan.added.map((n) => <li key={`a-${n}`}>{t("manual.planAdded", { name: n })}</li>)}
            {plan.removed.map((n) => <li key={`d-${n}`}>{t("manual.planRemoved", { name: n })}</li>)}
            {plan.kept.length > 0 && <li>{t("manual.planKept", { n: plan.kept.length })}</li>}
          </ul>
          <p className="text-xs">{t("manual.permanent")}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={flight.busy} aria-busy={flight.busy} onClick={() => void save()}>
              {flight.busy && <Spinner aria-hidden />}
              {t("manual.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("manual.back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={empty || !title.trim() || !!problem} onClick={() => setConfirming(true)}>
            {t("manual.review")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRemoving(true)}>
            {t("manual.markRemoved")}
          </Button>
        </div>
      )}
      {empty && !confirming && <p className="text-xs opacity-70">{t("manual.nothingYet")}</p>}
      <Note message={message} />
    </div>
  );
}

function RemoveBox({
  source,
  doc,
  removed,
  onSaved,
  onCancel,
}: {
  source: AdminSource;
  doc: DocRow;
  removed: boolean; // true: the document is removed now and this box restores it
} & Done) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const afterSave = useAfterSave(source);
  const [message, setMessage] = useState<Message>(null);

  async function run() {
    setMessage(null);
    await flight.run(async () => {
      try {
        const r = await adminApi.manualSetRemoved(source.id, doc.id, !removed);
        await afterSave();
        onSaved(resultText(t, r));
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <p>{removed ? t("manual.confirmRestore") : t("manual.confirmRemove")}</p>
      <div className="flex gap-2">
        <Button size="sm" variant={removed ? "default" : "destructive"} disabled={flight.busy} onClick={() => void run()}>
          {flight.busy && <Spinner aria-hidden />}
          {removed ? t("manual.restore") : t("manual.markRemoved")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
      <Note message={message} />
    </div>
  );
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
