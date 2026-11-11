"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_DOCUMENTS, type DocChoice, type DocRef, type Guide } from "@/lib/api/docgen";
import {
  PICKER_LIMIT,
  pickerDocuments,
  pickerFiles,
  pickerVersions,
  type PickerDocument,
  type PickerSource,
} from "@/lib/draft-picker";

// The document part of the draft form, shared by "New draft" and the draft page's side panel.
// Each chosen post has a version, the version its changes are listed against, and which of its
// parts are sent: the page text and each attached file (all ticked by default).

/** A post picked from a document page ("Draft a form from this"). */
export type InitialDoc = { id: number; title: string; source_id: number; version_no: number | null };

export type Chosen = InitialDoc & {
  files: string[] | null; // null = every attached file
  page_text: boolean;
  compare_with: number | null; // null = the version just before
  compare: boolean;
};

export function newChosen(doc: InitialDoc): Chosen {
  return { ...doc, files: null, page_text: true, compare_with: null, compare: true };
}

/** A saved choice back into the form (drafts saved before file choice use the defaults). */
export function chosenFromRef(ref: DocRef, title: string): Chosen {
  return {
    id: ref.document_id,
    title,
    source_id: ref.source_id,
    version_no: ref.version_no,
    files: ref.files ?? null,
    page_text: ref.page_text ?? true,
    compare_with: ref.compare_with ?? null,
    compare: ref.compare ?? true,
  };
}

export function choiceOf(c: Chosen): DocChoice {
  return {
    document_id: c.id,
    version_no: c.version_no,
    files: c.files,
    page_text: c.page_text,
    compare_with: c.compare ? c.compare_with : null,
    compare: c.compare,
  };
}

/** True when the row would send nothing (no page text and no file ticked). */
export function sendsNothing(c: Chosen, fileCount: number | undefined): boolean {
  if (c.page_text) return false;
  if (c.files !== null) return c.files.length === 0;
  return fileCount === 0;
}

/** Sources among these that have AI switched off and were not allowed yet. */
export function sourcesNeedingAgreement(
  sourceIds: number[],
  allowed: number[],
  aiEnabled: Map<number, boolean>,
): number[] {
  return [...new Set(sourceIds)]
    .filter((s) => aiEnabled.get(s) === false && !allowed.includes(s))
    .sort((a, b) => a - b);
}

export function DocumentPicker({
  chosen,
  onChange,
  sources,
  byId,
  initialSource,
}: {
  chosen: Chosen[];
  onChange: (next: Chosen[]) => void;
  sources: PickerSource[];
  byId: Map<number, PickerSource>;
  initialSource?: number | null;
}) {
  const t = useTranslations("drafts");
  const [sourceId, setSourceId] = useState<number | null>(initialSource ?? null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["picker", "documents", sourceId, search],
    queryFn: () => pickerDocuments(sourceId!, search),
    enabled: sourceId !== null,
  });

  function add(doc: PickerDocument) {
    setError(null);
    if (chosen.some((c) => c.id === doc.id)) return;
    if (chosen.length >= MAX_DOCUMENTS) {
      setError(t("tooMany", { max: MAX_DOCUMENTS }));
      return;
    }
    const row = newChosen({ id: doc.id, title: doc.title, source_id: doc.source_id, version_no: null });
    // Found by a file name: only the matching files start ticked (page text stays ticked).
    onChange([...chosen, doc.matched_files?.length ? { ...row, files: doc.matched_files } : row]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("source")}
          <select
            className="rounded border px-2 py-1.5"
            value={sourceId ?? ""}
            onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("chooseSource")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          {t("search")}
          <input
            className="rounded border px-2 py-1.5"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={sourceId === null}
          />
        </label>
      </div>
      {sourceId !== null && (
        <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded border text-sm">
          {results.isLoading && <li className="p-2 opacity-70">{t("loading")}</li>}
          {results.data?.documents.length === 0 && <li className="p-2 opacity-70">{t("noResults")}</li>}
          {results.data?.documents.map((d) => {
            const isChosen = chosen.some((c) => c.id === d.id);
            return (
              <li key={d.id} className="flex items-center gap-2 p-2">
                <span className="flex-1 break-words">
                  {d.title}
                  {d.posted_on && <span className="ml-2 opacity-60">{d.posted_on}</span>}
                  {d.matched_files?.length ? (
                    <span className="block text-xs break-all opacity-80">
                      {t("matchedFiles", { names: d.matched_files.join(", ") })}
                    </span>
                  ) : null}
                </span>
                <Button size="sm" variant="outline" disabled={isChosen} onClick={() => add(d)}>
                  {isChosen ? t("added") : t("add")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {results.data?.more && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {t(search.trim() ? "moreResultsSearch" : "moreResults", { n: PICKER_LIMIT })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <h3 className="text-sm font-medium">{t("chosen")}</h3>
      {chosen.length === 0 ? (
        <p className="text-sm opacity-70">{t("noneChosen")}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {chosen.map((c) => (
            <ChosenRow
              key={c.id}
              chosen={c}
              source={byId.get(c.source_id)}
              onUpdate={(next) => onChange(chosen.map((x) => (x.id === c.id ? next : x)))}
              onRemove={() => onChange(chosen.filter((x) => x.id !== c.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChosenRow({
  chosen,
  source,
  onUpdate,
  onRemove,
}: {
  chosen: Chosen;
  source: PickerSource | undefined;
  onUpdate: (next: Chosen) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("drafts");
  const versions = useQuery({
    queryKey: ["picker", "versions", chosen.id],
    queryFn: () => pickerVersions(chosen.id),
  });
  const files = useQuery({
    queryKey: ["picker", "files", chosen.id, chosen.version_no],
    queryFn: () => pickerFiles(chosen.id, chosen.version_no),
  });
  const names = (files.data ?? []).map((f) => f.filename);
  const ticked = new Set(chosen.files ?? names);
  // The send button stays blocked only for an explicit empty choice (see sendsNothing); the
  // server refuses the rest with the same reason before anything is counted.
  const empty = files.isSuccess && sendsNothing(chosen, names.length);

  // The version the changes can be listed against: any shown version older than this one
  // ("the version before" already covers the one just before).
  const current = chosen.version_no ?? versions.data?.[0]?.version_no ?? null;
  const older = (versions.data ?? []).filter(
    (v) => current !== null && v.version_no < current && v.version_no !== current - 1,
  );
  const compareValue = !chosen.compare ? "none" : chosen.compare_with === null ? "prev" : String(chosen.compare_with);

  function toggleFile(name: string, on: boolean) {
    const next = new Set(ticked);
    if (on) next.add(name);
    else next.delete(name);
    // All ticked again = "every file", so a file added to the post later is included too.
    const list = names.filter((n) => next.has(n));
    onUpdate({ ...chosen, files: list.length === names.length ? null : list });
  }

  return (
    <li className="flex flex-col gap-2 rounded border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-40 flex-1 break-words">
          {chosen.title}
          {source && <span className="ml-2 opacity-60">{source.name}</span>}
        </span>
        <select
          className="rounded border px-2 py-1"
          aria-label={t("versions")}
          value={chosen.version_no ?? ""}
          onChange={(e) =>
            // Another version has other files: every file is ticked again, and the comparison
            // goes back to "the version before".
            onUpdate({
              ...chosen,
              version_no: e.target.value ? Number(e.target.value) : null,
              files: null,
              compare_with: null,
            })
          }
        >
          <option value="">{t("newest")}</option>
          {/* A version pinned from a document page stays visible even if the list is not
              loaded (or does not have it), so the screen never shows "newest" for it. */}
          {chosen.version_no !== null && !versions.data?.some((v) => v.version_no === chosen.version_no) && (
            <option value={chosen.version_no}>{t("pinnedVersion", { n: chosen.version_no })}</option>
          )}
          {versions.data?.map((v) => (
            <option key={v.version_no} value={v.version_no}>
              {t("versionN", { n: v.version_no })}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-2 py-1"
          aria-label={t("changesFrom")}
          value={compareValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") onUpdate({ ...chosen, compare: false, compare_with: null });
            else if (v === "prev") onUpdate({ ...chosen, compare: true, compare_with: null });
            else onUpdate({ ...chosen, compare: true, compare_with: Number(v) });
          }}
        >
          <option value="prev">{t("changesPrev")}</option>
          {older.map((v) => (
            <option key={v.version_no} value={v.version_no}>
              {t("changesFromN", { n: v.version_no })}
            </option>
          ))}
          <option value="none">{t("changesNone")}</option>
        </select>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          {t("remove")}
        </Button>
      </div>
      <fieldset className="flex flex-col gap-1 pl-1">
        <legend className="sr-only">{t("partsToSend", { title: chosen.title })}</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chosen.page_text}
            onChange={(e) => onUpdate({ ...chosen, page_text: e.target.checked })}
          />
          {t("pageText")}
        </label>
        {files.isLoading && <span className="opacity-70">{t("loading")}</span>}
        {files.data?.map((f) => (
          <label key={f.filename} className="flex items-center gap-2">
            <input type="checkbox" checked={ticked.has(f.filename)} onChange={(e) => toggleFile(f.filename, e.target.checked)} />
            <span className="break-all">{f.filename}</span>
            {f.no_text && <span className="text-xs opacity-60">{t("fileNoText")}</span>}
          </label>
        ))}
        {empty && <p className="text-xs text-red-600">{t("rowEmpty")}</p>}
      </fieldset>
    </li>
  );
}

/** Marks a guide an admin set for every site. */
export function GlobalTag() {
  const t = useTranslations("drafts");
  return <span className="rounded border px-1 text-xs opacity-80">{t("guideGlobal")}</span>;
}

export function GuideChecklist({
  guides,
  unticked,
  onChange,
}: {
  guides: Guide[];
  unticked: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const t = useTranslations("drafts");
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {guides.map((g) => (
        <li key={g.id}>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!unticked.has(g.id)}
              onChange={(e) => {
                const next = new Set(unticked);
                if (e.target.checked) next.delete(g.id);
                else next.add(g.id);
                onChange(next);
              }}
            />
            {g.title}
            {g.is_global && <GlobalTag />}
            <span className="opacity-60">{t("guideChars", { n: g.chars })}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function AiOffBoxes({
  sourceIds,
  names,
  agreed,
  onChange,
}: {
  sourceIds: number[];
  names: Map<number, string>;
  agreed: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const t = useTranslations("drafts");
  return (
    <>
      {sourceIds.map((s) => {
        const name = names.get(s) ?? `#${s}`;
        return (
          <div
            key={s}
            className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="flex items-center gap-2 font-medium">
              <ShieldAlert className="size-4" aria-hidden />
              {t("aiOffTitle", { name })}
            </p>
            <p className="mt-1">{t("aiOffText")}</p>
            <label className="mt-2 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreed.has(s)}
                onChange={(e) => {
                  const next = new Set(agreed);
                  if (e.target.checked) next.add(s);
                  else next.delete(s);
                  onChange(next);
                }}
              />
              {t("aiOffAgree", { name })}
            </label>
          </div>
        );
      })}
    </>
  );
}
