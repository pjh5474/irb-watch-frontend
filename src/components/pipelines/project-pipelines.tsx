"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useProjectAccess } from "@/components/projects/project-access";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { pipelineApi } from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

export const pipelinesKey = (projectId: number) => ["pipelines", "project", projectId] as const;

type Hospital = { id: number; name: string };

function errorText(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) return e.status === 0 ? t("unreachable") : e.message || t("failed");
  return t("failed");
}

// The project page's "IRB pipelines" part: per hospital a start button or a link to its
// pipeline, plus pipelines of hospitals no longer in the project. Removed pipelines can be
// shown and restored. Any hospital may get a pipeline, even one whose boards the user cannot
// read (then only their own uploads).
export function ProjectPipelines({ projectId, hospitals }: { projectId: number; hospitals: Hospital[] }) {
  const t = useTranslations("pipelines");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRemoved, setShowRemoved] = useState(false);
  const list = useQuery({
    queryKey: [...pipelinesKey(projectId), showRemoved],
    queryFn: () => pipelineApi.list(projectId, showRemoved),
  });
  const flight = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const { canEdit } = useProjectAccess();

  async function start(hospitalId: number) {
    setError(null);
    await flight.run(async () => {
      try {
        const created = await pipelineApi.start(projectId, hospitalId);
        await queryClient.invalidateQueries({ queryKey: pipelinesKey(projectId) });
        router.push(`/pipelines/${created.id}`);
      } catch (e) {
        setError(errorText(e, t));
      }
    });
  }

  async function restore(id: number) {
    setError(null);
    await flight.run(async () => {
      try {
        await pipelineApi.restore(id);
        await queryClient.invalidateQueries({ queryKey: pipelinesKey(projectId) });
      } catch (e) {
        setError(errorText(e, t));
      }
    });
  }

  if (list.isLoading) return <p className="text-sm opacity-70">{t("loading")}</p>;
  if (list.isError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorText(list.error, t)}
      </p>
    );
  const pipelines = list.data ?? [];
  const live = new Map(pipelines.filter((p) => p.deleted_at === null).map((p) => [p.hospital_id, p]));
  const hospitalIds = new Set(hospitals.map((h) => h.id));
  const elsewhere = pipelines.filter((p) => p.deleted_at === null && !hospitalIds.has(p.hospital_id));
  const removed = pipelines.filter((p) => p.deleted_at !== null);

  const progress = (steps: number, closed: number) => t("progress", { closed, steps });

  return (
    <div className="flex flex-col gap-3">
      {hospitals.length === 0 && <p className="text-sm opacity-70">{t("noSites")}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {hospitals.map((hospital) => {
          const p = live.get(hospital.id);
          return (
            <li key={hospital.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
              <span className="flex-1">{hospital.name}</span>
              {p ? (
                <>
                  <span className="opacity-70">{progress(p.steps, p.closed_steps)}</span>
                  <Link href={`/pipelines/${p.id}`} className="underline underline-offset-4">
                    {t("open")}
                  </Link>
                </>
              ) : !canEdit ? (
                <span className="text-xs opacity-60">{t("noPipeline")}</span>
              ) : (
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void start(hospital.id)}>
                  {flight.busy && <Spinner aria-hidden />}
                  {t("start")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {elsewhere.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">{t("notInProject")}</h3>
          <ul className="flex flex-col gap-1">
            {elsewhere.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="flex-1">{p.hospital_name ?? t("siteUnavailable")}</span>
                <span className="opacity-70">{progress(p.steps, p.closed_steps)}</span>
                <Link href={`/pipelines/${p.id}`} className="underline underline-offset-4">
                  {t("open")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
        {t("showRemoved")}
      </label>
      {showRemoved && removed.length === 0 && <p className="text-xs opacity-70">{t("noneRemoved")}</p>}
      {showRemoved && removed.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {removed.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="flex-1 opacity-70">
                {p.hospital_name ?? t("siteUnavailable")} · {t("removedOn", { date: (p.deleted_at ?? "").slice(0, 10) })}
              </span>
              {canEdit && (
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void restore(p.id)}>
                  {t("restore")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
