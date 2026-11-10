"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, FlaskConical, ScrollText, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  aiApi,
  FEATURES,
  MAX_CHARS,
  SUMMARY_KINDS,
  type Feature,
  type InstructionVersion,
  type TestResult,
} from "@/lib/api/ai";
import { useSingleFlight } from "@/lib/use-single-flight";

export const AI_KEY = ["admin", "ai-instructions"] as const;

type Message = { kind: "ok" | "error"; text: string } | null;

const ICONS = { agent: Bot, docgen: FileText, summary: ScrollText } as const;
const ACCENTS = { agent: "violet", docgen: "blue", summary: "amber" } as const;

export function AiInstructions() {
  const t = useTranslations("admin");
  const query = useQuery({ queryKey: AI_KEY, queryFn: aiApi.current });
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Section icon={Sparkles} accent="slate" level={1} title={t("ai.title")}>
        <p className="text-sm opacity-80">{t("ai.intro")}</p>
      </Section>
      {query.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(query.error, t)}
        </p>
      )}
      {query.data &&
        FEATURES.map((f) => (
          <FeatureCard
            key={f}
            feature={f}
            current={query.data.find((c) => c.feature === f)?.current ?? null}
          />
        ))}
    </main>
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

function FeatureCard({ feature, current }: { feature: Feature; current: InstructionVersion | null }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const saved = current?.body ?? "";
  // Starts from the saved text; save, reset and restore set it to what was saved.
  const [text, setText] = useState(saved);
  const [message, setMessage] = useState<Message>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const flight = useSingleFlight();

  const history = useQuery({
    queryKey: [...AI_KEY, "history", feature],
    queryFn: () => aiApi.history(feature),
    enabled: showHistory,
  });

  const label =
    feature === "agent" ? t("ai.feature.agent") : feature === "docgen" ? t("ai.feature.docgen") : t("ai.feature.summary");
  const hint =
    feature === "agent"
      ? t("ai.featureHint.agent")
      : feature === "docgen"
        ? t("ai.featureHint.docgen")
        : t("ai.featureHint.summary");
  const tooLong = text.length > MAX_CHARS;
  const changed = text.trim() !== saved;

  async function act(action: () => Promise<InstructionVersion>, done: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        const now = await action();
        setText(now.body);
        setConfirmReset(false);
        await queryClient.invalidateQueries({ queryKey: AI_KEY });
        setMessage({ kind: "ok", text: done });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      }
    });
  }

  return (
    <Section icon={ICONS[feature]} accent={ACCENTS[feature]} title={label}>
      <p className="text-sm opacity-80">{hint}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("ai.label")}
        <textarea
          className="min-h-32 rounded border p-2 text-sm"
          value={text}
          placeholder={t("ai.placeholder")}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={tooLong}
        />
      </label>
      <p className={`text-xs ${tooLong ? "text-red-600" : "opacity-60"}`}>
        {tooLong ? t("ai.tooLong", { max: MAX_CHARS }) : t("ai.chars", { n: text.length, max: MAX_CHARS })}
        {!saved && ` · ${t("ai.default")}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={flight.busy || tooLong || !changed}
          aria-busy={flight.busy}
          onClick={() => act(() => aiApi.save(feature, text), t("ai.saved"))}
        >
          {flight.busy && <Spinner aria-hidden />}
          {t("ai.save")}
        </Button>
        {saved &&
          (confirmReset ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {t("ai.confirmReset")}
              <Button size="sm" variant="destructive" disabled={flight.busy} onClick={() => act(() => aiApi.reset(feature), t("ai.resetDone"))}>
                {t("ai.confirm")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                {t("ai.cancel")}
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
              {t("ai.reset")}
            </Button>
          ))}
        <Button size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
          {showHistory ? t("ai.historyHide") : t("ai.historyShow")}
        </Button>
      </div>
      <Note message={message} />

      {showHistory && (
        <div className="flex flex-col gap-2">
          {history.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
          {history.isError && (
            <p role="alert" className="text-sm text-red-600">
              {adminErrorText(history.error, t)}
            </p>
          )}
          {history.data?.length === 0 && <p className="text-sm opacity-70">{t("ai.historyEmpty")}</p>}
          <ul className="flex flex-col divide-y rounded border text-sm">
            {history.data?.map((v) => (
              <li key={v.id} className="flex flex-col gap-1 p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs opacity-80">
                  <span>#{v.id}</span>
                  <span>
                    {t("ai.historyEntry", {
                      date: format.dateTime(new Date(v.created_at), { dateStyle: "medium", timeStyle: "short" }),
                    })}
                  </span>
                  {v.restored_from !== null && <span>{t("ai.restoredFrom", { id: v.restored_from })}</span>}
                  {v.id === current?.id ? (
                    <Badge tone="good">{t("ai.current")}</Badge>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={flight.busy}
                      onClick={() => act(() => aiApi.restore(feature, v.id), t("ai.restored"))}
                    >
                      {t("ai.restore")}
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{v.body || t("ai.historyEmptyBody")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TestBox feature={feature} text={text} disabled={tooLong} />
    </Section>
  );
}

function TestBox({ feature, text, disabled }: { feature: Feature; text: string; disabled: boolean }) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const [question, setQuestion] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [kind, setKind] = useState<(typeof SUMMARY_KINDS)[number]>("document");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsDocument = feature !== "agent";
  const docId = /^\d+$/.test(documentId.trim()) ? Number(documentId.trim()) : null;
  const kindLabel = (k: (typeof SUMMARY_KINDS)[number]) =>
    k === "document" ? t("ai.kinds.document") : k === "change" ? t("ai.kinds.change") : t("ai.kinds.new");

  async function run() {
    setError(null);
    setResult(null);
    if (feature === "agent" && !question.trim()) return setError(t("ai.needQuestion"));
    if (needsDocument && docId === null) return setError(t("ai.needDocument"));
    await flight.run(async () => {
      try {
        const q = feature === "summary" ? kind : question.trim();
        setResult(await aiApi.test(feature, text, needsDocument ? docId : null, q));
      } catch (e) {
        setError(adminErrorText(e, t));
      }
    });
  }

  return (
    <details className="rounded border p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4" aria-hidden />
        {t("ai.testTitle")}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs opacity-70">{t("ai.testHint")}</p>
        {needsDocument && (
          <label className="flex flex-col gap-1 text-sm">
            {t("ai.documentId")}
            <input
              className="w-40 rounded border px-2 py-1"
              inputMode="numeric"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            />
            <span className="text-xs opacity-60">{t("ai.documentIdHint")}</span>
          </label>
        )}
        {feature === "summary" ? (
          <label className="flex flex-col gap-1 text-sm">
            {t("ai.kind")}
            <select
              className="w-fit rounded border px-2 py-1"
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof SUMMARY_KINDS)[number])}
            >
              {SUMMARY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            {feature === "agent" ? t("ai.question") : t("ai.request")}
            <input className="rounded border px-2 py-1" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </label>
        )}
        <div>
          <Button size="sm" variant="outline" disabled={disabled || flight.busy} aria-busy={flight.busy} onClick={run}>
            {flight.busy && <Spinner aria-hidden />}
            {flight.busy ? t("ai.running") : t("ai.run")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">{t("ai.result")}</p>
            <div className="rounded border bg-muted/40 p-3">
              <MarkdownText rich>{result.text}</MarkdownText>
            </div>
            {result.note && <p className="text-xs opacity-60">{result.note}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
