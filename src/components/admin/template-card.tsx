"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { HospitalChecklist } from "@/components/admin/guide-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AdminHospital } from "@/lib/api/admin";
import {
  docgenApi,
  templateFileProblem,
  toUpload,
  type FieldEdit,
  type FormField,
  type FormTemplate,
} from "@/lib/api/docgen";
import { useSingleFlight } from "@/lib/use-single-flight";

// One form template: its state (waiting for the field check, or ready), its sites, and the
// admin's tools (check fields, edit sites, global, rename, replace the file, archive).

type Mode = null | "fields" | "sites" | "rename" | "replace" | "archive";
type Message = { kind: "ok" | "error"; text: string } | null;

/** One row of the field check: a detected field, kept or not, with the admin's label. */
export type ReviewRow = { field: FormField; keep: boolean; label: string; hint: string; multi: boolean };

/** Rows for the field check: every detected field in file order; the template's current list
 * says which are kept and with what label (a new template keeps all of them). */
export function reviewRows(detected: FormField[], current: FormField[]): ReviewRow[] {
  const kept = new Map(current.map((f) => [f.key, f]));
  return detected.map((f) => {
    const k = kept.get(f.key);
    return { field: f, keep: !!k, label: k?.label ?? f.label, hint: k?.hint ?? "", multi: k?.multi ?? f.multi };
  });
}

export function editsOf(rows: ReviewRow[]): FieldEdit[] {
  return rows
    .filter((r) => r.keep)
    .map((r) => ({ key: r.field.key, label: r.label.trim(), hint: r.hint.trim(), multi: r.field.kind === "choice" && r.multi }));
}

export function TemplateCard({
  template,
  hospitals,
  names,
  onChanged,
}: {
  template: FormTemplate;
  hospitals: AdminHospital[];
  names: Map<number, string>;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const [mode, setMode] = useState<Mode>(template.status === "review" && !template.archived_at ? "fields" : null);
  const [message, setMessage] = useState<Message>(null);
  const archived = !!template.archived_at;

  async function run(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await action();
        setMode(null);
        setMessage({ kind: "ok", text: done });
        await onChanged();
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const toggle = (m: Mode) => {
    setMessage(null);
    setMode(mode === m ? null : m);
  };
  const tool = (m: Mode, label: string, disabled = false) => (
    <Button size="sm" variant={mode === m ? "default" : "ghost"} disabled={disabled || flight.busy} onClick={() => toggle(m)} aria-expanded={mode === m}>
      {label}
    </Button>
  );

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-words">{template.title}</span>
        {template.doc_type && <span className="opacity-70">{template.doc_type}</span>}
        {template.status === "review" ? <Badge>{t("templates.inReview")}</Badge> : <Badge>{t("templates.ready")}</Badge>}
        {template.is_global && <Badge>{t("guides.global")}</Badge>}
        {archived && <Badge>{t("guides.archived")}</Badge>}
        <span className="opacity-60 break-all">{template.filename}</span>
        <span className="opacity-60">{t("templates.fieldCount", { n: template.fields.length })}</span>
      </div>
      <p className="text-xs opacity-80">
        {template.is_global
          ? t("templates.offeredAll")
          : template.hospital_ids.length
            ? t("templates.offeredTo", { names: template.hospital_ids.map((h) => names.get(h) ?? `#${h}`).join(", ") })
            : t("templates.notOffered")}
      </p>
      {template.status === "review" && !archived && <p className="text-xs text-amber-700">{t("templates.reviewHint")}</p>}
      <div className="flex flex-wrap gap-1">
        {tool("fields", t("templates.checkFields"))}
        {!archived && (
          <>
            {tool("sites", t("guides.editSites"), template.is_global)}
            <Button
              size="sm"
              variant="ghost"
              disabled={flight.busy}
              onClick={() =>
                run(
                  () => docgenApi.updateTemplate(template.id, { is_global: !template.is_global }),
                  t(template.is_global ? "templates.madeSiteSpecific" : "templates.madeGlobal"),
                )
              }
            >
              {t(template.is_global ? "guides.makeSiteSpecific" : "guides.makeGlobal")}
            </Button>
            {tool("rename", t("templates.rename"))}
            {tool("replace", t("guides.replace"))}
            {tool("archive", t("guides.archive"))}
          </>
        )}
      </div>

      {mode === "fields" && (
        <FieldReview
          template={template}
          readOnly={archived}
          busy={flight.busy}
          onSave={(edits) => run(() => docgenApi.saveTemplateFields(template.id, edits), t("templates.fieldsSaved", { n: edits.length }))}
        />
      )}
      {mode === "sites" && (
        <HospitalChecklist
          hospitals={hospitals}
          initial={template.hospital_ids}
          busy={flight.busy}
          onCancel={() => setMode(null)}
          onSave={(ids) => run(() => docgenApi.setTemplateHospitals(template.id, ids), t("templates.sitesSaved", { n: ids.length }))}
        />
      )}
      {mode === "rename" && (
        <RenameBox
          title={template.title}
          docType={template.doc_type}
          busy={flight.busy}
          onSave={(title, docType) => run(() => docgenApi.updateTemplate(template.id, { title, doc_type: docType }), t("templates.renamed"))}
        />
      )}
      {mode === "replace" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs opacity-80">{t("templates.replaceHint")}</p>
          <label className="flex flex-col gap-1">
            {t("templates.file")}
            <input
              type="file"
              accept=".docx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const problem = templateFileProblem(file);
                if (problem) {
                  setMessage({ kind: "error", text: t(problem === "type" ? "templates.fileType" : problem === "size" ? "guides.fileSize" : "guides.fileEmpty") });
                  return;
                }
                void run(async () => docgenApi.replaceTemplateFile(template.id, await toUpload(file)), t("templates.replacedDone"));
              }}
            />
          </label>
        </div>
      )}
      {mode === "archive" && (
        <span className="flex flex-wrap items-center gap-2">
          {t("templates.confirmArchive")}
          <Button size="sm" variant="destructive" disabled={flight.busy} onClick={() => run(() => docgenApi.archiveTemplate(template.id), t("templates.archivedDone"))}>
            {t("guides.confirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            {t("guides.cancel")}
          </Button>
        </span>
      )}
      {flight.busy && <Spinner aria-hidden />}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function FieldReview({
  template,
  readOnly,
  busy,
  onSave,
}: {
  template: FormTemplate;
  readOnly: boolean;
  busy: boolean;
  onSave: (edits: FieldEdit[]) => void;
}) {
  const t = useTranslations("admin");
  const detected = useQuery({
    queryKey: ["admin", "template-detected", template.id, template.updated_at],
    queryFn: () => docgenApi.detectedFields(template.id),
  });
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  if (detected.isLoading) return <p className="opacity-70">{t("loading")}</p>;
  if (detected.isError) return <p role="alert" className="text-red-600">{adminErrorText(detected.error, t)}</p>;
  const current = rows ?? reviewRows(detected.data ?? [], template.fields);
  const set = (i: number, patch: Partial<ReviewRow>) => setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const edits = editsOf(current);
  const badLabel = current.some((r) => r.keep && !r.label.trim());

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <p className="text-xs opacity-80">{t("templates.fieldsHint")}</p>
      <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
        {current.map((r, i) => (
          <li key={r.field.key} className={`flex flex-col gap-1 rounded border p-2 ${r.keep ? "" : "opacity-50"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.keep} disabled={readOnly} onChange={(e) => set(i, { keep: e.target.checked })} />
                {t("templates.keep")}
              </label>
              <Badge>{r.field.source === "marker" ? t("templates.marker") : t("templates.found")}</Badge>
              <span className="text-xs opacity-60">
                {r.field.kind === "choice" ? t("templates.choice", { options: r.field.options.join(" / ") }) : t("templates.text")}
              </span>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs">{t("templates.label")}</span>
              <input
                className="rounded border px-2 py-1"
                value={r.label}
                maxLength={120}
                disabled={readOnly || !r.keep}
                aria-label={t("templates.labelOf", { key: r.field.key })}
                onChange={(e) => set(i, { label: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">{t("templates.hint")}</span>
              <input
                className="rounded border px-2 py-1"
                value={r.hint}
                maxLength={300}
                disabled={readOnly || !r.keep}
                placeholder={t("templates.hintPlaceholder")}
                onChange={(e) => set(i, { hint: e.target.value })}
              />
            </label>
            {r.field.kind === "choice" && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={r.multi} disabled={readOnly || !r.keep} onChange={(e) => set(i, { multi: e.target.checked })} />
                {t("templates.multi")}
              </label>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-80">{t("templates.keptCount", { n: edits.length, total: current.length })}</span>
          <Button size="sm" disabled={busy || edits.length === 0 || badLabel} onClick={() => onSave(edits)}>
            {t("templates.saveFields")}
          </Button>
          {edits.length === 0 && <span className="text-xs text-amber-700">{t("templates.keepOne")}</span>}
          {badLabel && <span className="text-xs text-amber-700">{t("templates.needLabel")}</span>}
        </div>
      )}
    </div>
  );
}

function RenameBox({
  title,
  docType,
  busy,
  onSave,
}: {
  title: string;
  docType: string;
  busy: boolean;
  onSave: (title: string, docType: string) => void;
}) {
  const t = useTranslations("admin");
  const [name, setName] = useState(title);
  const [kind, setKind] = useState(docType);
  const clean = name.trim();
  const changed = clean !== title || kind.trim() !== docType;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean && changed) onSave(clean, kind.trim());
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        {t("guides.name")}
        <input className="rounded border px-2 py-1.5" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex min-w-40 flex-col gap-1">
        {t("templates.docType")}
        <input className="rounded border px-2 py-1.5" value={kind} maxLength={100} onChange={(e) => setKind(e.target.value)} />
      </label>
      <Button type="submit" size="sm" disabled={busy || !clean || !changed}>
        {t("guides.save")}
      </Button>
    </form>
  );
}
