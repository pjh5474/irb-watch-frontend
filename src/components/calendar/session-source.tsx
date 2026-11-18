"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { sessionApi, type SessionSource } from "@/lib/api/calendar";

/**
 * Why a date was suggested: the post the AI read it from (title, day, board) and its short quote.
 * Shown to every signed-in user (owner, 2026-11-18); it never shows the post's text or files, so
 * a members-only post stays behind its normal access. The title and quote are page text: plain text only.
 */
export function SessionSourceView({ sessionId, hospitalId }: { sessionId: number; hospitalId?: number | null }) {
  const t = useTranslations("sessions.source");
  const [source, setSource] = useState<SessionSource | null>(null);
  const [problem, setProblem] = useState<"none" | "failed" | null>(null);

  useEffect(() => {
    let live = true;
    sessionApi
      .source(sessionId)
      .then((s) => live && setSource(s))
      .catch((e) => live && setProblem(e instanceof ApiError && e.status === 404 ? "none" : "failed"));
    return () => {
      live = false;
    };
  }, [sessionId]);

  const back = source?.hospital_id ?? hospitalId;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {!source && !problem && <p className="text-sm opacity-70">{t("loading")}</p>}
      {problem && (
        <p role="alert" className={`text-sm ${problem === "failed" ? "text-red-600" : "opacity-80"}`}>
          {t(problem)}
        </p>
      )}
      {source && (
        <section className="flex flex-col gap-3 rounded border p-4 text-sm">
          <p className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {source.origin === "ai" ? t("aiNote") : t("userNote")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="opacity-70">{t("hospital")}</dt>
            <dd>{source.hospital_name ?? "-"}</dd>
            <dt className="opacity-70">{t("board")}</dt>
            <dd>{source.board}</dd>
            <dt className="opacity-70">{t("post")}</dt>
            <dd className="whitespace-pre-wrap">
              {source.document_id ? (
                <Link href={`/documents/${source.document_id}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {source.title || t("openDocument")}
                </Link>
              ) : (
                source.title || "-"
              )}
            </dd>
            <dt className="opacity-70">{t("postedOn")}</dt>
            <dd>{source.posted_on ?? "-"}</dd>
            <dt className="opacity-70">{t("quote")}</dt>
            <dd>{source.quote ? <q className="opacity-90">{source.quote}</q> : "-"}</dd>
          </dl>
          {source.document_id ? (
            <Link
              href={`/documents/${source.document_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit rounded border px-3 py-1.5 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {t("openDocument")} ↗
            </Link>
          ) : null}
          <p className="text-xs opacity-70">{t("noText")}</p>
        </section>
      )}
      {back ? (
        <Link href={`/hospitals/${back}`} className="text-sm underline-offset-4 hover:underline">
          ← {t("toHospital")}
        </Link>
      ) : null}
    </main>
  );
}
