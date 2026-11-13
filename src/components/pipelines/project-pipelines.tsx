"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useProjectAccess } from "@/components/projects/project-access";
import { SiteDetails } from "@/components/sites/site-details";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { type PipelineSummary, pipelineApi } from "@/lib/api/pipelines";
import { type Site, siteApi, siteLabel } from "@/lib/api/sites";
import { useSingleFlight } from "@/lib/use-single-flight";

export const pipelinesKey = (projectId: number) => ["pipelines", "project", projectId] as const;
export const sitesKey = (projectId: number) => ["sites", "project", projectId] as const;

type Hospital = { id: number; name: string };

function errorText(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) return e.status === 0 ? t("unreachable") : e.message || t("failed");
  return t("failed");
}

// The project page's "Sites and IRB pipelines" part (phase B2a), grouped by hospital. A site is
// one IRB track: the hospital plus, when there are several, a PI and a site number. Each site
// has at most one pipeline. A hospital with no site yet starts with one click (its unnamed
// site and pipeline, as before); a hospital with named PIs starts per site. Pipelines of
// hospitals no longer in the project, removed pipelines and removed sites are listed below.
export function ProjectPipelines({ projectId, hospitals }: { projectId: number; hospitals: Hospital[] }) {
  const t = useTranslations("pipelines");
  const ts = useTranslations("sites");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRemoved, setShowRemoved] = useState(false);
  const list = useQuery({
    queryKey: [...pipelinesKey(projectId), showRemoved],
    queryFn: () => pipelineApi.list(projectId, showRemoved),
  });
  const sites = useQuery({ queryKey: [...sitesKey(projectId), showRemoved], queryFn: () => siteApi.list(projectId, showRemoved) });
  const flight = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null); // hospital whose "add a PI" form is open
  const [details, setDetails] = useState<number | null>(null); // site whose details are open
  const { canEdit } = useProjectAccess();

  async function act(work: () => Promise<unknown>, after?: (result: unknown) => void) {
    setError(null);
    await flight.run(async () => {
      try {
        const result = await work();
        await queryClient.invalidateQueries({ queryKey: pipelinesKey(projectId) });
        await queryClient.invalidateQueries({ queryKey: sitesKey(projectId) });
        after?.(result);
      } catch (e) {
        setError(errorText(e, t));
      }
    });
  }

  const start = (target: { hospital_id?: number; site_id?: number }) =>
    act(
      () => pipelineApi.start(projectId, target),
      (created) => router.push(`/pipelines/${(created as { id: number }).id}`),
    );

  if (list.isLoading || sites.isLoading) return <p className="text-sm opacity-70">{t("loading")}</p>;
  if (list.isError || sites.isError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorText(list.error ?? sites.error, t)}
      </p>
    );
  const pipelines = list.data ?? [];
  const allSites = sites.data ?? [];
  const liveSites = allSites.filter((s) => s.deleted_at === null);
  const bySite = new Map(pipelines.filter((p) => p.deleted_at === null && p.site_id != null).map((p) => [p.site_id as number, p]));
  const hospitalIds = new Set(hospitals.map((h) => h.id));
  const elsewhere = pipelines.filter((p) => p.deleted_at === null && !hospitalIds.has(p.hospital_id));
  const removed = pipelines.filter((p) => p.deleted_at !== null);
  const removedSites = allSites.filter((s) => s.deleted_at !== null);

  const progress = (p: PipelineSummary) => t("progress", { closed: p.closed_steps, steps: p.steps });

  function siteRow(site: Site) {
    const p = bySite.get(site.id);
    return (
      <li key={site.id} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">{siteLabel(site) || <span className="opacity-60">{ts("unnamed")}</span>}</span>
          {p ? (
            <>
              <span className="opacity-70">{progress(p)}</span>
              <Link href={`/pipelines/${p.id}`} className="underline underline-offset-4">
                {t("open")}
              </Link>
            </>
          ) : canEdit ? (
            <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void start({ site_id: site.id })}>
              {flight.busy && <Spinner aria-hidden />}
              {t("start")}
            </Button>
          ) : (
            <span className="text-xs opacity-60">{t("noPipeline")}</span>
          )}
          <Button size="sm" variant="ghost" aria-expanded={details === site.id} onClick={() => setDetails(details === site.id ? null : site.id)}>
            {ts("detailsButton")}
          </Button>
          {canEdit && !p && (
            <Button size="sm" variant="ghost" disabled={flight.busy} onClick={() => void act(() => siteApi.remove(site.id))}>
              {ts("removeSite")}
            </Button>
          )}
        </div>
        {details === site.id && (
          <div className="ml-2 rounded border p-2">
            <SiteDetails siteId={site.id} readOnly={!canEdit} />
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hospitals.length === 0 && <p className="text-sm opacity-70">{t("noSites")}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {hospitals.map((hospital) => {
          const own = liveSites.filter((s) => s.hospital_id === hospital.id);
          return (
            <li key={hospital.id} className="flex flex-col gap-2 rounded border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-medium">{hospital.name}</span>
                {own.length === 0 &&
                  (canEdit ? (
                    <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void start({ hospital_id: hospital.id })}>
                      {flight.busy && <Spinner aria-hidden />}
                      {t("start")}
                    </Button>
                  ) : (
                    <span className="text-xs opacity-60">{t("noPipeline")}</span>
                  ))}
                {canEdit && (
                  <Button size="sm" variant="ghost" aria-expanded={adding === hospital.id} onClick={() => setAdding(adding === hospital.id ? null : hospital.id)}>
                    {ts("addPi")}
                  </Button>
                )}
              </div>
              {own.length > 0 && <ul className="ml-2 flex flex-col gap-1">{own.map(siteRow)}</ul>}
              {adding === hospital.id && (
                <AddSite
                  busy={flight.busy}
                  onAdd={(pi, no) =>
                    act(() => siteApi.create(projectId, { hospital_id: hospital.id, pi_name: pi, site_no: no }), () => setAdding(null))
                  }
                  onCancel={() => setAdding(null)}
                />
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
                <span className="flex-1">
                  {p.hospital_name ?? t("siteUnavailable")}
                  {siteLabel(p) && ` · ${siteLabel(p)}`}
                </span>
                <span className="opacity-70">{progress(p)}</span>
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
      {showRemoved && removed.length === 0 && removedSites.length === 0 && <p className="text-xs opacity-70">{t("noneRemoved")}</p>}
      {showRemoved && (removed.length > 0 || removedSites.length > 0) && (
        <ul className="flex flex-col gap-1 text-sm">
          {removed.map((p) => (
            <li key={`p-${p.id}`} className="flex items-center gap-2">
              <span className="flex-1 opacity-70">
                {p.hospital_name ?? t("siteUnavailable")}
                {siteLabel(p) && ` · ${siteLabel(p)}`} · {t("removedOn", { date: (p.deleted_at ?? "").slice(0, 10) })}
              </span>
              {canEdit && (
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void act(() => pipelineApi.restore(p.id))}>
                  {t("restore")}
                </Button>
              )}
            </li>
          ))}
          {removedSites.map((s) => (
            <li key={`s-${s.id}`} className="flex items-center gap-2">
              <span className="flex-1 opacity-70">
                {ts("removedSite", { name: hospitals.find((h) => h.id === s.hospital_id)?.name ?? "", label: siteLabel(s) || ts("unnamed") })}
              </span>
              {canEdit && (
                <Button size="sm" variant="outline" disabled={flight.busy} onClick={() => void act(() => siteApi.restore(s.id))}>
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

function AddSite({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (pi: string, no: string) => Promise<void>; onCancel: () => void }) {
  const ts = useTranslations("sites");
  const t = useTranslations("pipelines");
  const [pi, setPi] = useState("");
  const [no, setNo] = useState("");
  return (
    <form
      aria-label={ts("addPi")}
      className="ml-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(pi.trim(), no.trim());
      }}
    >
      <label className="flex flex-col gap-1">
        {ts("piName")}
        <input className="rounded border px-2 py-1" maxLength={100} value={pi} onChange={(e) => setPi(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {ts("siteNo")}
        <input className="w-24 rounded border px-2 py-1" maxLength={20} value={no} onChange={(e) => setNo(e.target.value)} />
      </label>
      <Button size="sm" type="submit" disabled={busy}>
        {t("add")}
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </form>
  );
}
