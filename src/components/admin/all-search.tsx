"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Section } from "@/components/admin/section";
import { Button } from "@/components/ui/button";
import { type AllSearchJob, type AllSearchPreview, allSearchApi } from "@/lib/api/calendar";
import { useSingleFlight } from "@/lib/use-single-flight";

const POLL_MS = 4000;
const open = (j: AllSearchJob) => j.status === "queued" || j.status === "running";

/**
 * ALL-SEARCH (owner, 2026-11-18): an admin reads a hospital's whole backlog by hand (step 1,
 * quietly, in batches, stoppable) and then lets the AI look for IRB dates in it (step 2, after a
 * preview of its size). Run it for a new hospital and for hospitals read with the old post cap.
 */
export function AllSearch({ hospitalId, name }: { hospitalId: number; name: string }) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<AllSearchPreview | null>(null);
  const key = ["admin", "all-search", hospitalId] as const;
  const jobs = useQuery({
    queryKey: key,
    queryFn: () => allSearchApi.jobs(hospitalId),
    refetchInterval: (q) => (q.state.data?.some(open) ? POLL_MS : false),
  });
  const running = jobs.data?.find(open) ?? null;

  async function run(work: () => Promise<unknown>, ok: string) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
      } catch (e) {
        setMessage({ kind: "error", text: adminErrorText(e, t) });
      } finally {
        await queryClient.invalidateQueries({ queryKey: key });
        await queryClient.invalidateQueries({ queryKey: ["admin", "sessions"] });
      }
    });
  }

  return (
    <Section icon={DatabaseZap} accent="amber" title={t("sessions.allSearch.title", { name })}>
      <p className="text-sm opacity-80">{t("sessions.allSearch.intro")}</p>

      <div className="flex flex-col gap-2 rounded border p-3">
        <h3 className="text-sm font-medium">{t("sessions.allSearch.step1")}</h3>
        <p className="text-xs opacity-70">{t("sessions.allSearch.step1Help")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={flight.busy || running !== null} onClick={() => void run(() => allSearchApi.read(hospitalId), t("sessions.allSearch.readStarted"))}>
            {t("sessions.allSearch.read")}
          </Button>
          {running && (
            <Button size="sm" variant="outline" disabled={flight.busy || running.stop_requested} onClick={() => void run(() => allSearchApi.stop(running.id), t("sessions.allSearch.stopAsked"))}>
              {running.stop_requested ? t("sessions.allSearch.stopping") : t("sessions.allSearch.stop")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded border p-3">
        <h3 className="text-sm font-medium">{t("sessions.allSearch.step2")}</h3>
        <p className="text-xs opacity-70">{t("sessions.allSearch.step2Help")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={flight.busy || running !== null}
            onClick={() =>
              void flight.run(async () => {
                setMessage(null);
                try {
                  setPreview(await allSearchApi.preview(hospitalId));
                } catch (e) {
                  setPreview(null);
                  setMessage({ kind: "error", text: adminErrorText(e, t) });
                }
              })
            }
          >
            {t("sessions.allSearch.checkSize")}
          </Button>
        </div>
        {preview && (
          <div className="flex flex-col gap-2 text-sm">
            {!preview.enabled && <p className="text-amber-700 dark:text-amber-300">{t("sessions.findOff")}</p>}
            <p>
              {preview.posts === 0
                ? t("sessions.allSearch.nothingToRead", { stored: preview.stored_posts })
                : t("sessions.allSearch.previewText", {
                    stored: preview.stored_posts,
                    posts: preview.posts,
                    chars: preview.chars.toLocaleString(),
                    calls: preview.run_batches,
                  })}
            </p>
            {preview.left_over > 0 && <p className="opacity-80">{t("sessions.allSearch.leftOver", { n: preview.left_over })}</p>}
            {preview.posts > 0 && (
              <div>
                <Button
                  size="sm"
                  disabled={flight.busy || running !== null || !preview.enabled}
                  onClick={() =>
                    void run(async () => {
                      await allSearchApi.ai(hospitalId);
                      setPreview(null);
                    }, t("sessions.allSearch.aiStarted"))
                  }
                >
                  {t("sessions.allSearch.confirmAi", { calls: preview.run_batches })}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
          {message.text}
        </p>
      )}
      {jobs.isError && (
        <p role="alert" className="text-sm text-red-600">
          {adminErrorText(jobs.error, t)}
        </p>
      )}
      <ul className="flex flex-col gap-3 text-sm">
        {(jobs.data ?? []).slice(0, 4).map((j) => (
          <JobBlock key={j.id} job={j} />
        ))}
      </ul>
    </Section>
  );
}

function JobBlock({ job }: { job: AllSearchJob }) {
  const t = useTranslations("admin");
  const boards = Object.entries(job.progress.boards ?? {});
  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums opacity-70">{job.created_at.slice(0, 16).replace("T", " ")}</span>
        <span className="font-medium">{t(`sessions.allSearch.stage.${job.stage}`)}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            job.status === "failed"
              ? "bg-red-100 text-red-800"
              : job.status === "done"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-sky-100 text-sky-900"
          }`}
        >
          {t(`sessions.allSearch.status.${job.status}`)}
        </span>
        {job.stage === "ai" && job.progress.batches !== undefined && (
          <span>
            {t("sessions.allSearch.aiProgress", {
              done: job.progress.batches_done ?? 0,
              calls: job.progress.batches,
              proposed: job.progress.proposed ?? 0,
            })}
          </span>
        )}
      </div>
      {job.error && <p className="text-red-700">{job.error}</p>}
      {boards.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="opacity-70">
              <th className="pr-2 font-normal">{t("sessions.allSearch.board")}</th>
              <th className="pr-2 font-normal">{t("sessions.allSearch.stored")}</th>
              <th className="pr-2 font-normal">{t("sessions.allSearch.left")}</th>
              <th className="font-normal">{t("sessions.allSearch.boardState")}</th>
            </tr>
          </thead>
          <tbody>
            {boards.map(([id, b]) => (
              <tr key={id}>
                <td className="pr-2">{b.name}</td>
                <td className="pr-2 tabular-nums">
                  {b.stored} ({b.total})
                </td>
                <td className="pr-2 tabular-nums">{b.left ?? "-"}</td>
                <td>
                  {t(`sessions.allSearch.boardStates.${b.state}`)}
                  {b.failed > 0 && ` · ${t("sessions.allSearch.failedPosts", { n: b.failed })}`}
                  {b.flagged > 0 && ` · ${t("sessions.allSearch.flaggedPosts", { n: b.flagged })}`}
                  {b.error && <span className="text-red-700"> · {b.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
