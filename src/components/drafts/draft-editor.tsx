"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, ShieldAlert, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { DiffView } from "@/components/diff-view";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { ApiError, saveFile } from "@/lib/api/client";
import { docgenApi, elapsed, MAX_INSTRUCTION_CHARS, type DraftDetail } from "@/lib/api/docgen";
import { wordDiff } from "@/lib/diff";
import { pickerSources } from "@/lib/draft-picker";
import { useElapsed } from "@/lib/use-elapsed";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

/** Sources of the draft that have AI switched off now and were not allowed when it was made. */
export function sourcesNeedingAgreement(detail: DraftDetail, aiEnabled: Map<number, boolean>): number[] {
  const used = [...new Set(detail.draft.documents.map((d) => d.source_id))];
  return used
    .filter((s) => aiEnabled.get(s) === false && !detail.draft.ai_override_source_ids.includes(s))
    .sort((a, b) => a - b);
}

export function DraftEditor({ id }: { id: string }) {
  const t = useTranslations("drafts");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const key = ["docgen", "draft", id];
  const query = useQuery({ queryKey: key, queryFn: () => docgenApi.get(id), retry: false });
  const sources = useQuery({ queryKey: ["picker", "sources"], queryFn: pickerSources });

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
  const needAgree = sourcesNeedingAgreement(detail, aiEnabled);
  const missingAgree = needAgree.some((s) => !agreed.has(s));

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
    if (!request || dirty || missingAgree) return;
    setMessage(null);
    setConflict(false);
    timer.start();
    await revise.run(async () => {
      try {
        const v = await docgenApi.revise(id, request, needAgree.filter((s) => agreed.has(s)));
        // Any leftover edit box (even one equal to the old text) must not hide the revision.
        dropEdits();
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <Link href="/drafts" className="text-sm underline-offset-4 hover:underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold break-words">{detail.draft.title || t("editorTitle")}</h1>

      <Section icon={FileText} accent="slate" title={t("basedOn")}>
        <ul className="flex flex-col gap-1 text-sm">
          {detail.draft.documents.map((d) => (
            <li key={`${d.document_id}-${d.version_no}`}>
              <Link href={`/documents/${d.document_id}?v=${d.version_no}`} className="underline-offset-4 hover:underline">
                {t("documentN", { id: d.document_id, n: d.version_no })}
              </Link>
              {names.get(d.source_id) && <span className="ml-2 opacity-60">{names.get(d.source_id)}</span>}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <span className="font-medium">{t("guidesUsed")}: </span>
          {detail.guides.length ? detail.guides.map((g) => g.title).join(", ") : t("noGuidesUsed")}
        </p>
        {detail.draft.extra_guides.length > 0 && (
          <p className="text-sm">
            <span className="font-medium">{t("attachedGuides")}: </span>
            {detail.draft.extra_guides.join(", ")}
          </p>
        )}
        {detail.draft.ai_override_source_ids.length > 0 && (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t("aiOffUsed", {
              names: detail.draft.ai_override_source_ids.map((s) => names.get(s) ?? `#${s}`).join(", "),
            })}
          </p>
        )}
      </Section>

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
        {needAgree.map((s) => {
          const name = names.get(s) ?? `#${s}`;
          return (
            <div key={s} className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
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
                    setAgreed(next);
                  }}
                />
                {t("aiOffAgree", { name })}
              </label>
            </div>
          );
        })}
        {dirty && <p className="text-xs text-amber-700">{t("reviseUnsaved")}</p>}
        <div>
          <Button
            size="sm"
            onClick={askRevision}
            disabled={revise.busy || dirty || missingAgree || !instruction.trim() || instruction.length > MAX_INSTRUCTION_CHARS}
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
    </main>
  );
}
