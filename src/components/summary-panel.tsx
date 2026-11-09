"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/types/api";

type Block = "limit" | "unavailable" | null;

// Answer of POST /admin/documents/{id}/summary (not in the generated API types until they are
// regenerated after the backend is deployed).
type RegenerateOut = { summary: string; version_no: number; replaced: boolean };

export function SummaryPanel({
  documentId,
  cachedSummary,
  canRegenerate = false,
}: {
  documentId: number;
  cachedSummary: string | null;
  // True only for an admin looking at the newest version. The server re-checks the role.
  canRegenerate?: boolean;
}) {
  const t = useTranslations("doc");
  const [summary, setSummary] = useState(cachedSummary);
  const [block, setBlock] = useState<Block>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // A ref, not state: two clicks in the same instant would both see busy=false, and every
  // new summary costs an AI call. One guard covers both the first summary and a re-summary.
  const inFlight = useRef(false);

  function failure(e: unknown) {
    if (e instanceof ApiError && e.status === 429) setBlock("limit");
    else if (e instanceof ApiError && e.status === 503) setBlock("unavailable");
    else if (e instanceof ApiError && e.status === 0) setError(t("summaryError.unreachable"));
    else if (e instanceof ApiError && e.status === 404) setError(t("summaryError.notFound"));
    else setError(t("summaryError.generic"));
  }

  async function request() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const out = await apiFetch<components["schemas"]["SummaryOut"]>(
        `/documents/${documentId}/summary`,
        { method: "POST" },
      );
      setSummary(out.summary);
    } catch (e) {
      failure(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function regenerate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRegenerating(true);
    setConfirming(false);
    setError(null);
    try {
      const out = await apiFetch<RegenerateOut>(`/admin/documents/${documentId}/summary`, {
        method: "POST",
      });
      setSummary(out.summary);
    } catch (e) {
      failure(e); // the old summary stays on screen and in the database
    } finally {
      inFlight.current = false;
      setRegenerating(false);
    }
  }

  if (summary) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded border bg-muted/40 p-3" aria-busy={regenerating}>
          <MarkdownText rich>{summary}</MarkdownText>
          <p className="mt-3 text-xs opacity-60">{t("aiNote")}</p>
        </div>
        {canRegenerate && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {regenerating ? (
              <>
                <Spinner aria-hidden />
                <span>{t("regenerating")}</span>
                <span className="opacity-70">{t("summarizingHint")}</span>
              </>
            ) : confirming ? (
              <>
                <span>{t("regenerateConfirm")}</span>
                <Button size="sm" onClick={regenerate}>
                  {t("regenerateYes")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  {t("regenerateNo")}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                {t("regenerate")}
              </Button>
            )}
          </div>
        )}
        {block && <p className="text-sm opacity-70">{t(`summaryBlocked.${block}`)}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={request}
        disabled={busy || block !== null}
        aria-busy={busy}
      >
        {busy && <Spinner aria-hidden />}
        {busy ? t("summarizing") : t("summarize")}
      </Button>
      {busy && <p className="text-sm opacity-70">{t("summarizingHint")}</p>}
      {block && <p className="text-sm opacity-70">{t(`summaryBlocked.${block}`)}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
