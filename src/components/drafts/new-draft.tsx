"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Paperclip, Search, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import {
  docgenApi,
  elapsed,
  guideFileProblem,
  MAX_DOCUMENTS,
  MAX_EXTRA_GUIDES,
  MAX_INSTRUCTION_CHARS,
  toUpload,
} from "@/lib/api/docgen";
import {
  pickerDocuments,
  pickerSources,
  pickerVersions,
  type PickerSource,
} from "@/lib/draft-picker";
import { useElapsed } from "@/lib/use-elapsed";
import { useSingleFlight } from "@/lib/use-single-flight";

export type Chosen = { id: number; title: string; source_id: number; version_no: number | null };

/** What the form sends: documents, guides (null = all defaults), and the ticked AI-off sources. */
export function buildRequest(
  chosen: Chosen[],
  defaultGuideIds: number[],
  unticked: Set<number>,
  agreed: Set<number>,
  aiOffSources: number[],
) {
  const guideIds = defaultGuideIds.filter((g) => !unticked.has(g));
  return {
    documents: chosen.map((c) => ({ document_id: c.id, version_no: c.version_no })),
    guide_ids: unticked.size === 0 ? null : guideIds,
    ai_override_source_ids: aiOffSources.filter((s) => agreed.has(s)),
  };
}

export function NewDraft({ initial }: { initial: Chosen | null }) {
  const t = useTranslations("drafts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const timer = useElapsed();

  const status = useQuery({ queryKey: ["docgen", "status"], queryFn: docgenApi.status });
  const sources = useQuery({ queryKey: ["picker", "sources"], queryFn: pickerSources });
  const byId = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s])), [sources.data]);

  // "Draft a form from this" on a document page starts with that document (and version).
  const [chosen, setChosen] = useState<Chosen[]>(initial ? [initial] : []);
  const [sourceId, setSourceId] = useState<number | null>(initial?.source_id ?? null);
  const [search, setSearch] = useState("");
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [agreed, setAgreed] = useState<Set<number>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const results = useQuery({
    queryKey: ["picker", "documents", sourceId, search],
    queryFn: () => pickerDocuments(sourceId!, search),
    enabled: sourceId !== null,
  });

  const usedSources = [...new Set(chosen.map((c) => c.source_id))].sort((a, b) => a - b);
  const aiOff = usedSources.filter((s) => byId.get(s)?.ai_enabled === false);
  const guides = useQuery({
    queryKey: ["docgen", "default-guides", usedSources.join(",")],
    queryFn: () => docgenApi.defaultGuides(usedSources),
    enabled: usedSources.length > 0,
  });

  function add(doc: { id: number; title: string; source_id: number }) {
    setError(null);
    if (chosen.some((c) => c.id === doc.id)) return;
    if (chosen.length >= MAX_DOCUMENTS) {
      setError(t("tooMany", { max: MAX_DOCUMENTS }));
      return;
    }
    setChosen([...chosen, { ...doc, version_no: null }]);
  }

  function pickFiles(list: FileList | null) {
    setFileError(null);
    const picked = [...files, ...Array.from(list ?? [])];
    if (picked.length > MAX_EXTRA_GUIDES) {
      setFileError(t("tooManyFiles", { max: MAX_EXTRA_GUIDES }));
      return;
    }
    for (const f of picked) {
      const problem = guideFileProblem(f);
      if (problem) {
        setFileError(t(problem === "type" ? "fileType" : problem === "size" ? "fileSize" : "fileEmpty", { name: f.name }));
        return;
      }
    }
    setFiles(picked);
  }

  const missingAgree = aiOff.some((s) => !agreed.has(s));
  const off = status.data && !status.data.enabled;
  // The guide list must be loaded for the current sources: an explicit list built from a list
  // that is still loading (or failed) would send no guides at all.
  const guidesReady = usedSources.length === 0 || (guides.isSuccess && !guides.isFetching);
  const canSend =
    chosen.length > 0 && guidesReady && !missingAgree && !off && request.length <= MAX_INSTRUCTION_CHARS;

  async function generate() {
    if (!canSend) return;
    setError(null);
    timer.start();
    await flight.run(async () => {
      try {
        const base = buildRequest(chosen, (guides.data ?? []).map((g) => g.id), unticked, agreed, aiOff);
        const detail = await docgenApi.create({
          ...base,
          extra_guides: await Promise.all(files.map(toUpload)),
          instruction: request.trim(),
        });
        // The list and the usage counter changed, wherever the user is now.
        await queryClient.invalidateQueries({ queryKey: ["docgen", "drafts"] });
        await queryClient.invalidateQueries({ queryKey: ["docgen", "status"] });
        // Only if the user is still here: someone who left must not be pulled back.
        if (mounted.current) router.push(`/drafts/${detail.draft.id}`);
      } catch (e) {
        if (mounted.current) setError(adminErrorText(e, t));
      }
    });
    if (mounted.current) timer.stop();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <Link href="/drafts" className="text-sm underline-offset-4 hover:underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      {status.data && (
        <p className="text-sm opacity-70">
          {status.data.enabled
            ? t("usage", { used: status.data.used, limit: status.data.limit })
            : t("off", { reason: status.data.reason ?? "" })}
        </p>
      )}

      <Section icon={Search} accent="blue" title={t("step1")}>
        <p className="text-sm opacity-80">{t("step1Hint", { max: MAX_DOCUMENTS })}</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("source")}
            <select
              className="rounded border px-2 py-1.5"
              value={sourceId ?? ""}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("chooseSource")}</option>
              {(sources.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
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
            {results.data?.length === 0 && <li className="p-2 opacity-70">{t("noResults")}</li>}
            {results.data?.map((d) => {
              const isChosen = chosen.some((c) => c.id === d.id);
              return (
                <li key={d.id} className="flex items-center gap-2 p-2">
                  <span className="flex-1 break-words">
                    {d.title}
                    {d.posted_on && <span className="ml-2 opacity-60">{d.posted_on}</span>}
                  </span>
                  <Button size="sm" variant="outline" disabled={isChosen} onClick={() => add(d)}>
                    {isChosen ? t("added") : t("add")}
                  </Button>
                </li>
              );
            })}
          </ul>
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
                onVersion={(v) => setChosen(chosen.map((x) => (x.id === c.id ? { ...x, version_no: v } : x)))}
                onRemove={() => setChosen(chosen.filter((x) => x.id !== c.id))}
              />
            ))}
          </ul>
        )}

        {aiOff.map((s) => {
          const name = byId.get(s)?.name ?? `#${s}`;
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
      </Section>

      <Section icon={Paperclip} accent="violet" title={t("step2")}>
        <p className="text-sm opacity-80">{t("step2Hint", { max: MAX_EXTRA_GUIDES })}</p>
        {usedSources.length > 0 && guides.data?.length === 0 && (
          <p className="text-sm opacity-70">{t("noGuides")}</p>
        )}
        {guides.isError && (
          <p role="alert" className="text-sm text-red-600">
            {adminErrorText(guides.error, t)}
          </p>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {guides.data?.map((g) => (
            <li key={g.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!unticked.has(g.id)}
                  onChange={(e) => {
                    const next = new Set(unticked);
                    if (e.target.checked) next.delete(g.id);
                    else next.add(g.id);
                    setUnticked(next);
                  }}
                />
                {g.title}
                <span className="opacity-60">{t("guideChars", { n: g.chars })}</span>
              </label>
            </li>
          ))}
        </ul>
        <label className="flex flex-col gap-1 text-sm">
          {t("attach")}
          <input
            type="file"
            multiple
            accept=".pdf,.hwp,.hwpx,.docx,.md,.txt"
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {fileError && (
          <p role="alert" className="text-sm text-red-600">
            {fileError}
          </p>
        )}
        {files.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                <span className="flex-1 break-words">{f.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={FilePlus2} accent="slate" title={t("step3")}>
        <textarea
          className="min-h-24 rounded border p-2 text-sm"
          placeholder={t("requestPlaceholder")}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          aria-invalid={request.length > MAX_INSTRUCTION_CHARS}
        />
        <p className={`text-xs ${request.length > MAX_INSTRUCTION_CHARS ? "text-red-600" : "opacity-60"}`}>
          {t("chars", { n: request.length, max: MAX_INSTRUCTION_CHARS })}
        </p>
      </Section>

      <div className="flex flex-col gap-2">
        <div>
          <Button onClick={generate} disabled={!canSend || flight.busy} aria-busy={flight.busy}>
            {flight.busy && <Spinner aria-hidden />}
            {flight.busy ? t("writing", { time: elapsed(timer.ms) }) : t("generate")}
          </Button>
        </div>
        {flight.busy && <p className="text-sm opacity-70" role="status">{t("writingHint")}</p>}
        {!flight.busy && chosen.length === 0 && <p className="text-xs opacity-60">{t("needDocuments")}</p>}
        {!flight.busy && missingAgree && <p className="text-xs text-amber-700">{t("needAgree")}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function ChosenRow({
  chosen,
  source,
  onVersion,
  onRemove,
}: {
  chosen: Chosen;
  source: PickerSource | undefined;
  onVersion: (v: number | null) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("drafts");
  const versions = useQuery({
    queryKey: ["picker", "versions", chosen.id],
    queryFn: () => pickerVersions(chosen.id),
  });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded border p-2">
      <span className="min-w-40 flex-1 break-words">
        {chosen.title}
        {source && <span className="ml-2 opacity-60">{source.name}</span>}
      </span>
      <select
        className="rounded border px-2 py-1"
        aria-label={t("versions")}
        value={chosen.version_no ?? ""}
        onChange={(e) => onVersion(e.target.value ? Number(e.target.value) : null)}
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
      <Button size="sm" variant="ghost" onClick={onRemove}>
        {t("remove")}
      </Button>
    </li>
  );
}
