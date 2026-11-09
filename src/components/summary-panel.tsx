"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
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

  async function request() {
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
      else if (e instanceof ApiError && e.status === 404) setError(t("summaryError.notFound"));
      else setError(t("summaryError.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>;
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={request}
        disabled={busy || block !== null}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        {t("summarize")}
      </button>
      {block && <p className="text-sm opacity-70">{t(`summaryBlocked.${block}`)}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
