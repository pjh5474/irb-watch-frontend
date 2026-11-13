"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Spinner } from "@/components/ui/spinner";
import { type DraftJob, docgenApi, isOpenJob } from "@/lib/api/docgen";

export const JOBS_KEY = ["docgen", "jobs"] as const;
const POLL_MS = 3_000;

/**
 * The user's draft jobs: open ones and those that failed in the last 24 hours. Asked again
 * every few seconds while a job is open. When one ends, `onFinished` runs (to load the lists
 * that changed).
 */
export function useDraftJobs(onFinished?: () => void) {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: JOBS_KEY,
    queryFn: docgenApi.jobs,
    refetchInterval: (q) => (q.state.data?.some(isOpenJob) ? POLL_MS : false),
  });
  const openBefore = useRef(0);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);
  const open = jobs.data?.filter(isOpenJob).length;
  useEffect(() => {
    if (open === undefined) return;
    if (open < openBefore.current) {
      // A job ended: the drafts, the usage counter and any step's drafts changed.
      void queryClient.invalidateQueries({ queryKey: ["docgen", "drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["docgen", "status"] });
      finished.current?.();
    }
    openBefore.current = open;
  }, [open, queryClient]);
  return jobs;
}

/** One line per job: being written, or failed with the server's reason. Nothing for none. */
export function DraftJobLines({ jobs }: { jobs: DraftJob[] }) {
  const t = useTranslations("drafts");
  const format = useFormatter();
  if (jobs.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {jobs.map((job) => {
        const kind = t(job.kind === "revision" ? "jobs.revision" : "jobs.draft");
        // A colleague's job in a shared project says whose it is.
        const by = job.mine === false ? ` (${t("jobs.by", { name: job.started_by || t("jobs.someone") })})` : "";
        return isOpenJob(job) ? (
          <li key={job.id} role="status" className="flex items-center gap-2">
            <Spinner aria-hidden />
            {t(job.status === "queued" ? "jobs.queued" : "jobs.running", { kind })}
            {by}
          </li>
        ) : (
          <li key={job.id} role="alert" className="text-red-600">
            {t("jobs.failed", {
              kind,
              time: format.dateTime(new Date(job.finished_at ?? job.created_at), { timeStyle: "short" }),
              reason: job.error ?? "",
            })}
            {by}
          </li>
        );
      })}
    </ul>
  );
}

/** The jobs part of the Drafts page: standalone drafts and pipeline drafts alike. */
export function DraftJobs() {
  const t = useTranslations("drafts");
  const jobs = useDraftJobs();
  if (jobs.isError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {adminErrorText(jobs.error, t)}
      </p>
    );
  return <DraftJobLines jobs={jobs.data ?? []} />;
}
