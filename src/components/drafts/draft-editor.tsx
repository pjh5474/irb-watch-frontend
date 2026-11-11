"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { DiffView } from "@/components/diff-view";
import { AiOffBoxes, sendsNothing, sourcesNeedingAgreement } from "@/components/drafts/document-picker";
import {
  DocLine,
  InputsEditor,
  PanelButtons,
  panelGuides,
  reviseInputs,
  startPanel,
  type PanelState,
} from "@/components/drafts/inputs-panel";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { ApiError, saveFile } from "@/lib/api/client";
import { docgenApi, elapsed, MAX_INSTRUCTION_CHARS, type DraftDetail, type VersionInputs } from "@/lib/api/docgen";
import { wordDiff } from "@/lib/diff";
import { pickerSources, pickerTitles } from "@/lib/draft-picker";
import { useElapsed } from "@/lib/use-elapsed";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

const sourcesOf = (detail: DraftDetail | undefined) =>
  [...new Set((detail?.draft.documents ?? []).map((d) => d.source_id))].sort((a, b) => a - b);

export function DraftEditor({ id }: { id: string }) {
  const t = useTranslations("drafts");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const key = ["docgen", "draft", id];
  const query = useQuery({ queryKey: key, queryFn: () => docgenApi.get(id), retry: false });
  const sources = useQuery({ queryKey: ["picker", "sources"], queryFn: pickerSources });
  const [panel, setPanel] = useState<PanelState | null>(null); // null = the draft's current inputs

  // Titles of every document named by the draft or any of its versions.
  const docIds = [
    ...new Set(
      [query.data?.draft.documents ?? [], ...(query.data?.versions ?? []).map((v) => v.inputs?.documents ?? [])]
        .flat()
        .map((d) => d.document_id),
    ),
  ].sort((a, b) => a - b);
  const titles = useQuery({
    queryKey: ["picker", "titles", docIds.join(",")],
    queryFn: () => pickerTitles(docIds),
    enabled: docIds.length > 0,
  });
  const draftSources = sourcesOf(query.data);
  const originalDefaults = useQuery({
    queryKey: ["docgen", "default-guides", draftSources.join(",")],
    queryFn: () => docgenApi.defaultGuides(draftSources),
    enabled: panel !== null && draftSources.length > 0,
  });
  const panelSources = [...new Set((panel?.chosen ?? []).map((c) => c.source_id))].sort((a, b) => a - b);
  const panelDefaults = useQuery({
    queryKey: ["docgen", "default-guides", panelSources.join(",")],
    queryFn: () => docgenApi.defaultGuides(panelSources),
    enabled: panel !== null && panelSources.length > 0,
  });

  const save = useSingleFlight();
  const revise = useSingleFlight();
  const exporter = useSingleFlight();
  const timer = useElapsed();

  const [viewing, setViewing] = useState<number | null>(null); // null = the newest
  const [buffer, setBuffer] = useState<string | null>(null); // null = no unsaved edits
  const [bufferBase, setBufferBase] = useState<number | null>(null); // version the edits started from
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [agreed, setAgreed] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<Message>(null);
  const [conflict, setConflict] = useState(false);

  const detail = query.data;
  const names = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s.name])), [sources.data]);
  const byId = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s])), [sources.data]);
  const aiEnabled = useMemo(
    () => new Map((sources.data ?? []).map((s) => [s.id, s.ai_enabled])),
    [sources.data],
  );

  if (query.isLoading) return <main className="mx-auto w-full max-w-5xl p-6 text-sm opacity-70">{t("loading")}</main>;
  if (query.isError || !detail) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-6">
        <Link href="/drafts" className="text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <p role="alert" className="text-sm text-red-600">
          {notFound ? t("notFound") : adminErrorText(query.error, t)}
        </p>
      </main>
    );
  }

  const versions = detail.versions;
  const newest = versions[versions.length - 1];
  const shown = versions.find((v) => v.version_no === viewing) ?? newest;
  const isNewest = shown.version_no === newest.version_no;
  const text = isNewest ? (buffer ?? newest.markdown) : shown.markdown;
  const dirty = buffer !== null && buffer !== newest.markdown;
  const other = compareWith !== null ? versions.find((v) => v.version_no === compareWith) : undefined;
  const diff = other ? wordDiff(other.markdown, shown.markdown) : null;
  const needAgree = sourcesNeedingAgreement(
    panel ? panelSources : draftSources,
    detail.draft.ai_override_source_ids,
    aiEnabled,
  );
  const missingAgree = needAgree.some((s) => !agreed.has(s));
  const guideChoices = panel
    ? panelGuides(panel, detail, panelDefaults.data ?? [], new Set((originalDefaults.data ?? []).map((g) => g.id)))
    : [];
  // The panel's guide list must be loaded before its choice is sent (see the new-draft form).
  const panelReady =
    panel === null ||
    (panel.chosen.length > 0 &&
      !panel.chosen.some((c) => sendsNothing(c, undefined)) &&
      (draftSources.length === 0 || (originalDefaults.isSuccess && !originalDefaults.isFetching)) &&
      (panelSources.length === 0 || (panelDefaults.isSuccess && !panelDefaults.isFetching)));
  const titleOf = (docId: number) => titles.data?.get(docId);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ["docgen", "drafts"] });
    await queryClient.invalidateQueries({ queryKey: ["docgen", "status"] });
  }

  function dropEdits() {
    setBuffer(null);
    setBufferBase(null);
  }

  async function saveEdit() {
    if (!dirty || buffer === null) return;
    setMessage(null);
    setConflict(false);
    await save.run(async () => {
      try {
        // The version the edits started from: if a newer one appeared meanwhile (another tab,
        // an AI revision), the server refuses instead of building on old text.
        const v = await docgenApi.saveEdit(id, buffer, bufferBase ?? newest.version_no);
        dropEdits();
        setViewing(null);
        setMessage({ kind: "ok", text: t("saved", { n: v.version_no }) });
        await refresh();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setConflict(true);
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  async function askRevision() {
    const request = instruction.trim();
    if (!request || dirty || missingAgree || !panelReady) return;
    setMessage(null);
    setConflict(false);
    timer.start();
    await revise.run(async () => {
      try {
        const allowed = needAgree.filter((s) => agreed.has(s));
        const v = panel
          ? await docgenApi.revise(id, request, allowed, await reviseInputs(panel, guideChoices))
          : await docgenApi.revise(id, request, allowed);
        // Any leftover edit box (even one equal to the old text) must not hide the revision.
        dropEdits();
        setPanel(null);
        setInstruction("");
        setViewing(null);
        setMessage({ kind: "ok", text: t("revised", { n: v.version_no }) });
        await refresh();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) await sources.refetch();
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
    timer.stop();
  }

  async function download() {
    if (dirty && isNewest) return;
    setMessage(null);
    await exporter.run(async () => {
      try {
        const file = await docgenApi.exportDocx(id, shown.version_no);
        saveFile(file.blob, file.filename);
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  const tabClass = (active: boolean) =>
    `rounded px-3 py-1 text-sm md:hidden ${active ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border"}`;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
      <Link href="/drafts" className="text-sm underline-offset-4 hover:underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold break-words">{detail.draft.title || t("editorTitle")}</h1>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
      <section aria-label={t("versions")} className="flex flex-col gap-2">
        <h2 className="font-medium">{t("versions")}</h2>
        <ul className="flex flex-wrap gap-2">
          {[...versions].reverse().map((v) => (
            <li key={v.version_no}>
              <button
                type="button"
                onClick={() => {
                  setViewing(v.version_no === newest.version_no ? null : v.version_no);
                  setCompareWith(null);
                }}
                aria-current={v.version_no === shown.version_no ? "true" : undefined}
                className={`rounded border px-3 py-1 text-left text-sm ${v.version_no === shown.version_no ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : ""}`}
              >
                {t("versionN", { n: v.version_no })} · {t(`origin.${v.origin}`)}
                <span className="block text-xs opacity-70">
                  {format.dateTime(new Date(v.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            {t("compare")}
            <select
              className="rounded border px-2 py-1"
              value={compareWith ?? ""}
              onChange={(e) => setCompareWith(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("compareNone")}</option>
              {versions
                .filter((v) => v.version_no !== shown.version_no)
                .map((v) => (
                  <option key={v.version_no} value={v.version_no}>
                    {t("versionN", { n: v.version_no })}
                  </option>
                ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={download}
            disabled={exporter.busy || (dirty && isNewest)}
            aria-busy={exporter.busy}
          >
            {exporter.busy ? <Spinner aria-hidden /> : <Download aria-hidden />}
            {exporter.busy ? t("exporting") : t("export")}
          </Button>
          {dirty && isNewest && <span className="text-xs text-amber-700">{t("exportUnsaved")}</span>}
        </div>
      </section>

      {other ? (
        <section className="rounded border p-3">
          <h2 className="mb-2 text-sm font-medium">
            {t("versionN", { n: other.version_no })} → {t("versionN", { n: shown.version_no })}
          </h2>
          {diff ? <DiffView parts={diff} /> : <p className="text-sm opacity-70">{t("compareTooLarge")}</p>}
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <p className="text-sm opacity-70">
            {t("viewing", { n: shown.version_no })}
            {!isNewest && ` · ${t("readOnly")}`}
          </p>
          {shown.inputs && (
            <details className="text-sm">
              <summary className="cursor-pointer opacity-80">{t("versionRead", { n: shown.version_no })}</summary>
              <InputsSummary inputs={shown.inputs} titleOf={titleOf} names={names} guides={detail.guides} />
            </details>
          )}
          <div className="flex gap-2">
            <button type="button" className={tabClass(tab === "edit")} onClick={() => setTab("edit")}>
              {t("edit")}
            </button>
            <button type="button" className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
              {t("preview")}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              aria-label={t("edit")}
              className={`min-h-[28rem] rounded border p-3 font-mono text-sm ${tab === "edit" ? "" : "hidden"} md:block`}
              value={text}
              readOnly={!isNewest}
              onChange={(e) => {
                if (buffer === null) setBufferBase(newest.version_no);
                setBuffer(e.target.value);
              }}
            />
            <div
              aria-label={t("preview")}
              className={`min-h-[28rem] overflow-auto rounded border p-3 ${tab === "preview" ? "" : "hidden"} md:block`}
            >
              <MarkdownText rich>{text}</MarkdownText>
            </div>
          </div>
          {isNewest && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={saveEdit} disabled={!dirty || save.busy} aria-busy={save.busy}>
                {save.busy && <Spinner aria-hidden />}
                {t("save")}
              </Button>
              {dirty && (
                <>
                  <span className="text-xs text-amber-700">{t("unsaved")}</span>
                  <Button size="sm" variant="ghost" onClick={dropEdits}>
                    {t("discard")}
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <Section icon={Sparkles} accent="violet" title={t("revise")}>
        <textarea
          className="min-h-20 rounded border p-2 text-sm"
          placeholder={t("revisePlaceholder")}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          aria-invalid={instruction.length > MAX_INSTRUCTION_CHARS}
        />
        <AiOffBoxes sourceIds={needAgree} names={names} agreed={agreed} onChange={setAgreed} />
        {dirty && <p className="text-xs text-amber-700">{t("reviseUnsaved")}</p>}
        {panel && <p className="text-xs opacity-80">{t("reviseWithNewInputs")}</p>}
        <div>
          <Button
            size="sm"
            onClick={askRevision}
            disabled={
              revise.busy ||
              dirty ||
              missingAgree ||
              !panelReady ||
              !instruction.trim() ||
              instruction.length > MAX_INSTRUCTION_CHARS
            }
            aria-busy={revise.busy}
          >
            {revise.busy && <Spinner aria-hidden />}
            {revise.busy ? t("revising", { time: elapsed(timer.ms) }) : t("reviseButton")}
          </Button>
        </div>
        {revise.busy && <p className="text-sm opacity-70" role="status">{t("writingHint")}</p>}
      </Section>

      {message && (
        <div className="flex flex-wrap items-center gap-2">
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
          >
            {conflict ? `${t("conflict")} ${message.text}` : message.text}
          </p>
          {conflict && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                dropEdits();
                setConflict(false);
                setMessage(null);
                await refresh();
              }}
            >
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Section icon={FileText} accent="slate" title={t("basedOn")}>
          {panel ? (
            <InputsEditor
              state={panel}
              onChange={setPanel}
              sources={sources.data ?? []}
              byId={byId}
              guides={guideChoices}
              extraOnDraft={detail.draft.extra_guides}
            />
          ) : (
            <InputsSummary
              inputs={{
                documents: detail.draft.documents,
                guide_ids: detail.draft.guide_ids,
                extra_guides: detail.draft.extra_guides,
                ai_override_source_ids: detail.draft.ai_override_source_ids,
              }}
              titleOf={titleOf}
              names={names}
              guides={detail.guides}
            />
          )}
          <PanelButtons
            editing={panel !== null}
            onStart={() => setPanel(startPanel(detail, titles.data ?? new Map()))}
            onCancel={() => setPanel(null)}
          />
        </Section>
      </aside>
      </div>
    </main>
  );
}

function InputsSummary({
  inputs,
  titleOf,
  names,
  guides,
}: {
  inputs: VersionInputs;
  titleOf: (docId: number) => string | undefined;
  names: Map<number, string>;
  guides: { id: number; title: string }[];
}) {
  const t = useTranslations("drafts");
  const guideTitle = (g: number) => guides.find((x) => x.id === g)?.title ?? t("guideN", { id: g });
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul className="flex flex-col gap-2">
        {inputs.documents.map((d) => (
          <DocLine
            key={`${d.document_id}-${d.version_no}`}
            doc={d}
            title={titleOf(d.document_id)}
            sourceName={names.get(d.source_id)}
          />
        ))}
      </ul>
      <p>
        <span className="font-medium">{t("guidesUsed")}: </span>
        {inputs.guide_ids.length ? inputs.guide_ids.map(guideTitle).join(", ") : t("noGuidesUsed")}
      </p>
      {inputs.extra_guides.length > 0 && (
        <p>
          <span className="font-medium">{t("attachedGuides")}: </span>
          {inputs.extra_guides.join(", ")}
        </p>
      )}
      {inputs.ai_override_source_ids.length > 0 && (
        <p className="text-amber-800 dark:text-amber-200">
          {t("aiOffUsed", { names: inputs.ai_override_source_ids.map((s) => names.get(s) ?? `#${s}`).join(", ") })}
        </p>
      )}
    </div>
  );
}
