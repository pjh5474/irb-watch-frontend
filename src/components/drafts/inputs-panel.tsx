"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  choiceOf,
  chosenFromRef,
  DocumentPicker,
  GlobalTag,
  type Chosen,
} from "@/components/drafts/document-picker";
import { addGuideFiles, GuideFiles } from "@/components/drafts/new-draft";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { MAX_EXTRA_GUIDES, toUpload, type DocRef, type DraftDetail, type Guide, type ReviseInputs } from "@/lib/api/docgen";
import type { PickerSource } from "@/lib/draft-picker";

// The draft page's side panel: what the next AI revision reads. It shows the draft's current
// documents and guides; "Change" turns it into the same picker as the new-draft form. The
// changes are sent with the next revision and saved on that version (and as the draft's).

export type PanelState = {
  chosen: Chosen[];
  toggled: Map<number, boolean>; // guide id -> ticked, where the user changed it
  keep: Set<string>; // attached guide files to keep, by name
  files: File[]; // new guide files
};

export function startPanel(detail: DraftDetail, titles: Map<number, string>): PanelState {
  return {
    chosen: detail.draft.documents.map((d) => chosenFromRef(d, titles.get(d.document_id) ?? `#${d.document_id}`)),
    toggled: new Map(),
    keep: new Set(detail.draft.extra_guides),
    files: [],
  };
}

/** The guides offered: the current sources' defaults plus the guides the draft uses now. A
 * guide is ticked if the user ticked it, else if the draft uses it, else if it is a default
 * the draft's original sources did not have (a newly added source's guides start ticked). */
export function panelGuides(
  state: PanelState,
  detail: DraftDetail,
  defaults: Guide[],
  originalDefaults: Set<number>,
): { guide: Guide; ticked: boolean }[] {
  const all = new Map<number, Guide>();
  for (const g of [...detail.guides, ...defaults]) all.set(g.id, g);
  // Global guides first, as in the new-draft form.
  const list = [...all.values()].sort((a, b) => Number(!!b.is_global) - Number(!!a.is_global));
  return list.map((g) => ({
    guide: g,
    ticked: state.toggled.get(g.id) ?? (detail.draft.guide_ids.includes(g.id) || !originalDefaults.has(g.id)),
  }));
}

export async function reviseInputs(state: PanelState, guides: { guide: Guide; ticked: boolean }[]): Promise<ReviseInputs> {
  return {
    documents: state.chosen.map(choiceOf),
    guide_ids: guides.filter((g) => g.ticked).map((g) => g.guide.id),
    keep_extra_guides: [...state.keep],
    extra_guides: await Promise.all(state.files.map(toUpload)),
  };
}

/** One saved document choice in words. */
export function DocLine({ doc, title, sourceName }: { doc: DocRef; title?: string; sourceName?: string }) {
  const t = useTranslations("drafts");
  const parts: string[] = [];
  if (doc.files) parts.push(doc.files.length ? t("filesSome", { names: doc.files.join(", ") }) : t("filesNone"));
  else parts.push(t("filesAll"));
  if (doc.page_text === false) parts.push(t("pageTextOff"));
  if (doc.compare === false) parts.push(t("changesNone"));
  else if (doc.compare_with) parts.push(t("changesFromN", { n: doc.compare_with }));
  return (
    <li className="flex flex-col">
      <Link href={`/documents/${doc.document_id}?v=${doc.version_no}`} className="break-words underline-offset-4 hover:underline">
        {title ?? t("documentN", { id: doc.document_id, n: doc.version_no })}
        {title && <span className="opacity-60"> · {t("versionN", { n: doc.version_no })}</span>}
      </Link>
      {sourceName && <span className="text-xs opacity-60">{sourceName}</span>}
      <span className="text-xs opacity-80">{parts.join(" · ")}</span>
    </li>
  );
}

export function InputsEditor({
  state,
  onChange,
  sources,
  byId,
  guides,
  extraOnDraft,
}: {
  state: PanelState;
  onChange: (next: PanelState) => void;
  sources: PickerSource[];
  byId: Map<number, PickerSource>;
  guides: { guide: Guide; ticked: boolean }[];
  extraOnDraft: string[];
}) {
  const t = useTranslations("drafts");
  const [fileError, setFileError] = useState<string | null>(null);
  const room = MAX_EXTRA_GUIDES - state.keep.size;

  return (
    <div className="flex flex-col gap-3">
      <DocumentPicker
        chosen={state.chosen}
        onChange={(chosen) => onChange({ ...state, chosen })}
        sources={sources}
        byId={byId}
        initialSource={state.chosen[0]?.source_id ?? null}
      />
      <h3 className="text-sm font-medium">{t("guidesUsed")}</h3>
      {guides.length === 0 && <p className="text-sm opacity-70">{t("noGuidesUsed")}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {guides.map(({ guide, ticked }) => (
          <li key={guide.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ticked}
                onChange={(e) => onChange({ ...state, toggled: new Map(state.toggled).set(guide.id, e.target.checked) })}
              />
              {guide.title}
              {guide.is_global && <GlobalTag />}
            </label>
          </li>
        ))}
      </ul>
      {extraOnDraft.length > 0 && (
        <>
          <h3 className="text-sm font-medium">{t("attachedGuides")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {extraOnDraft.map((name) => (
              <li key={name}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={state.keep.has(name)}
                    onChange={(e) => {
                      const keep = new Set(state.keep);
                      if (e.target.checked) keep.add(name);
                      else keep.delete(name);
                      onChange({ ...state, keep });
                    }}
                  />
                  <span className="break-all">{name}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <GuideFiles
        files={state.files}
        onPick={(list) => {
          setFileError(null);
          const result = addGuideFiles(state.files, Array.from(list ?? []), room);
          if ("problem" in result) {
            setFileError(t(result.problem, { max: MAX_EXTRA_GUIDES, name: result.name ?? "" }));
            return;
          }
          onChange({ ...state, files: result.files });
        }}
        onRemove={(i) => onChange({ ...state, files: state.files.filter((_, j) => j !== i) })}
      />
      {fileError && (
        <p role="alert" className="text-sm text-red-600">
          {fileError}
        </p>
      )}
    </div>
  );
}

export function PanelButtons({ editing, onStart, onCancel }: { editing: boolean; onStart: () => void; onCancel: () => void }) {
  const t = useTranslations("drafts");
  return editing ? (
    <div className="flex flex-col gap-1">
      <p className="text-xs opacity-80">{t("inputsNextRevision")}</p>
      <div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("inputsCancel")}
        </Button>
      </div>
    </div>
  ) : (
    <div>
      <Button size="sm" variant="outline" onClick={onStart}>
        {t("inputsChange")}
      </Button>
    </div>
  );
}
