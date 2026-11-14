"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ResultBadge } from "@/components/pipelines/pipeline-view";
import { errorText } from "@/components/pipelines/shared";
import { Link } from "@/i18n/navigation";
import { type HospitalPage, type HospitalStep, pipelineApi } from "@/lib/api/pipelines";
import { siteLabel } from "@/lib/api/sites";

/** One row of the comparison: a step type and round ("2차 변경심의"), or a free step's name. */
type Row = { key: string; label: string };

const rowKey = (s: HospitalStep) => `${s.step_type_id ?? `free:${s.name.toLowerCase()}`}|${s.sequence_no ?? ""}`;

/** Rows in the order they first appear, going through the sites' steps in step order. */
export function hospitalRows(page: HospitalPage): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const site of page.sites) {
    for (const s of site.steps) {
      const key = rowKey(s);
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ key, label: s.label || s.name });
      }
    }
  }
  return rows;
}

/**
 * The hospital (IRB) page of a project: its sites (PIs) side by side, one row per step type
 * and round, the status and IRB result in each cell, so the user sees which PI is behind.
 * PIs of one hospital share one IRB (D6).
 */
export function HospitalView({ projectId, hospitalId }: { projectId: number; hospitalId: number }) {
  const t = useTranslations("pipelines");
  const page = useQuery({
    queryKey: ["pipelines", "hospital", projectId, hospitalId],
    queryFn: () => pipelineApi.hospital(projectId, hospitalId),
  });

  if (page.isLoading) return <main className="mx-auto w-full max-w-6xl p-6 text-sm opacity-70">{t("loading")}</main>;
  if (page.isError || !page.data)
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-2 p-6">
        <Link href={`/projects/${projectId}`} className="text-sm underline-offset-4 hover:underline">
          ← {t("backToProject")}
        </Link>
        <p role="alert" className="text-sm text-red-600">
          {errorText(page.error, t)}
        </p>
      </main>
    );

  const d = page.data;
  const rows = hospitalRows(d);
  const status = (key: string) => d.statuses.find((s) => s.key === key)?.label ?? key;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <Link href={`/projects/${projectId}`} className="text-sm underline-offset-4 hover:underline">
        ← {t("backToProject")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("hospitalTitle", { name: d.hospital_name ?? t("siteUnavailable") })}</h1>
      <p className="text-sm opacity-70">{t("hospitalIntro")}</p>
      {d.sites.length === 0 ? (
        <p className="text-sm opacity-70">{t("noHospitalSites")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border p-2 text-left" />
                {d.sites.map((site) => (
                  <th key={site.site_id} scope="col" className="border p-2 text-left font-medium">
                    {site.pipeline_id !== null ? (
                      <Link href={`/pipelines/${site.pipeline_id}`} className="underline-offset-4 hover:underline">
                        {siteLabel(site) || t("open")}
                      </Link>
                    ) : (
                      <span>{siteLabel(site)}</span>
                    )}
                    {site.pipeline_id === null && <div className="text-xs font-normal opacity-60">{t("noPipelineYet")}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="border p-2 text-left font-medium">
                    {row.label}
                  </th>
                  {d.sites.map((site) => {
                    const s = site.steps.find((x) => rowKey(x) === row.key);
                    const result = s ? d.results.find((r) => r.key === s.result_key) : undefined;
                    return (
                      <td key={site.site_id} className="border p-2 align-top">
                        {s && site.pipeline_id !== null ? (
                          <div className="flex flex-col gap-1">
                            <Link href={`/pipelines/${site.pipeline_id}/steps/${s.id}`} className="underline-offset-4 hover:underline">
                              {status(s.status_key)}
                            </Link>
                            {result && <ResultBadge result={result} />}
                            {s.subject && <span className="text-xs opacity-70">{s.subject}</span>}
                            {(s.submitted_on || s.decided_on || s.due_on) && (
                              <span className="text-xs opacity-70">
                                {s.decided_on
                                  ? `${t("decided_on")} ${s.decided_on}`
                                  : s.submitted_on
                                    ? `${t("submitted_on")} ${s.submitted_on}`
                                    : `${t("due_on")} ${s.due_on}`}
                              </span>
                            )}
                            {s.follow_ups > 0 && <span className="text-xs opacity-70">{t("followUpCount", { n: s.follow_ups })}</span>}
                          </div>
                        ) : (
                          <span className="opacity-40">{t("notStarted")}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
