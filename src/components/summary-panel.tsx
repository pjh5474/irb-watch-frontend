"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/types/api";

type Block = "limit" | "unavailable" | null;

export function SummaryPanel({
  documentId,
  cachedSummary,
}: {
  documentId: number;
  cachedSummary: string | null;
}) {
  const t = useTranslations("doc");
  const [summary, setSummary] = useState(cachedSummary);
  const [block, setBlock] = useState<Block>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks in the same instant would both see busy=false, and every
  // new summary costs an AI call and counts toward the daily limit.
  const inFlight = useRef(false);

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
      if (e instanceof ApiError && e.status === 429) setBlock("limit");
      else if (e instanceof ApiError && e.status === 503) setBlock("unavailable");
      else if (e instanceof ApiError && e.status === 0) setError(t("summaryError.unreachable"));
      else if (e instanceof ApiError && e.status === 404) setError(t("summaryError.notFound"));
      else setError(t("summaryError.generic"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (summary) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>;
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
