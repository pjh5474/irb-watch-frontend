"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileSpreadsheet, Paperclip, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import {
  AiOffBoxes,
  choiceOf,
  DocumentPicker,
  GuideChecklist,
  newChosen,
  sendsNothing,
  sourcesNeedingAgreement,
  type Chosen,
  type InitialDoc,
} from "@/components/drafts/document-picker";
import {
  FormChoice,
  formReady,
  formRequest,
  NO_FORM,
  useOfferedForms,
  type FormPick,
} from "@/components/drafts/form-choice";
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
import { pickerSources } from "@/lib/draft-picker";
import { useElapsed } from "@/lib/use-elapsed";
import { useSingleFlight } from "@/lib/use-single-flight";

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
    documents: chosen.map(choiceOf),
    guide_ids: unticked.size === 0 ? null : guideIds,
    ai_override_source_ids: aiOffSources.filter((s) => agreed.has(s)),
  };
}

/** Guide files to attach: checked and capped; returns a message key on a problem. */
export function addGuideFiles(
  current: File[],
  added: File[],
  room: number,
): { files: File[] } | { problem: "tooManyFiles" | "fileType" | "fileSize" | "fileEmpty"; name?: string } {
  const picked = [...current, ...added];
  if (picked.length > room) return { problem: "tooManyFiles" };
  for (const f of picked) {
    const problem = guideFileProblem(f);
    if (problem) {
      return { problem: problem === "type" ? "fileType" : problem === "size" ? "fileSize" : "fileEmpty", name: f.name };
    }
  }
  return { files: picked };
}

export function NewDraft({ initial }: { initial: InitialDoc | null }) {
  const t = useTranslations("drafts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const timer = useElapsed();

  const status = useQuery({ queryKey: ["docgen", "status"], queryFn: docgenApi.status });
  const sources = useQuery({ queryKey: ["picker", "sources"], queryFn: pickerSources });
  const byId = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s])), [sources.data]);
  const names = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s.name])), [sources.data]);
  const aiEnabled = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s.ai_enabled])), [sources.data]);

  // "Draft a form from this" on a document page starts with that document (and version).
  const [chosen, setChosen] = useState<Chosen[]>(initial ? [newChosen(initial)] : []);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [agreed, setAgreed] = useState<Set<number>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [form, setForm] = useState<FormPick>(NO_FORM);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const usedSources = [...new Set(chosen.map((c) => c.source_id))].sort((a, b) => a - b);
  const aiOff = sourcesNeedingAgreement(usedSources, [], aiEnabled);
  const guides = useQuery({
    queryKey: ["docgen", "default-guides", usedSources.join(",")],
    queryFn: () => docgenApi.defaultGuides(usedSources),
    enabled: usedSources.length > 0,
  });

  function pickFiles(list: FileList | null) {
    setFileError(null);
    const result = addGuideFiles(files, Array.from(list ?? []), MAX_EXTRA_GUIDES);
    if ("problem" in result) {
      setFileError(t(result.problem, { max: MAX_EXTRA_GUIDES, name: result.name ?? "" }));
      return;
    }
    setFiles(result.files);
  }

  const offered = useOfferedForms(usedSources);
  const formOk = formReady(form, offered.data);
  const missingAgree = aiOff.some((s) => !agreed.has(s));
  const off = status.data && !status.data.enabled;
  // The guide list must be loaded for the current sources: an explicit list built from a list
  // that is still loading (or failed) would send no guides at all.
  const guidesReady = usedSources.length === 0 || (guides.isSuccess && !guides.isFetching);
  const emptyRow = chosen.some((c) => sendsNothing(c, undefined));
  const canSend =
    chosen.length > 0 &&
    guidesReady &&
    !missingAgree &&
    !off &&
    !emptyRow &&
    formOk &&
    request.length <= MAX_INSTRUCTION_CHARS;

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
          ...(await formRequest(form)),
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
        <DocumentPicker
          chosen={chosen}
          onChange={setChosen}
          sources={sources.data ?? []}
          byId={byId}
          initialSource={initial?.source_id ?? null}
        />
        <AiOffBoxes sourceIds={aiOff} names={names} agreed={agreed} onChange={setAgreed} />
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
        <GuideChecklist guides={guides.data ?? []} unticked={unticked} onChange={setUnticked} />
        <GuideFiles files={files} onPick={pickFiles} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        {fileError && (
          <p role="alert" className="text-sm text-red-600">
            {fileError}
          </p>
        )}
      </Section>

      <Section icon={FileSpreadsheet} accent="blue" title={t("stepForm")}>
        <p className="text-sm opacity-80">{t("stepFormHint")}</p>
        <FormChoice sourceIds={usedSources} value={form} onChange={setForm} />
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
        {!flight.busy && !formOk && form.kind === "file" && (
          <p className="text-xs text-amber-700">{t("form.needFile")}</p>
        )}
        {!flight.busy && !formOk && form.kind === "list" && !offered.isFetching && (
          <p className="text-xs text-amber-700">{t("form.notOffered")}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

export function GuideFiles({
  files,
  onPick,
  onRemove,
}: {
  files: File[];
  onPick: (list: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations("drafts");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {t("attach")}
        <input
          type="file"
          multiple
          accept=".pdf,.hwp,.hwpx,.docx,.md,.txt"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 break-words">{f.name}</span>
              <Button size="sm" variant="ghost" onClick={() => onRemove(i)}>
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
