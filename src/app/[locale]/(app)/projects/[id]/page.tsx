import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { ProjectPipelines } from "@/components/pipelines/project-pipelines";
import { type HospitalRow, ProjectHospitals, ProjectSettings } from "@/components/projects";
import { Link } from "@/i18n/navigation";
import { pageCount, parsePage } from "@/lib/paging";
import { parseView, PROJECT_PAGE_SIZE, TIMELINE_TYPES } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { locale, id } = await params;
  const { view: viewParam, page: pageParam } = await searchParams;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  const projectId = Number(id);
  const view = parseView(viewParam);
  const page = parsePage(pageParam);

  const t = await getTranslations("projects");
  const format = await getFormatter();
  const supabase = await createClient();
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  // Row-level security: another user's project simply comes back empty.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, note, project_hospitals(hospital_id, added_at, hospitals(id, name))")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!project) notFound();

  // The project lists hospitals; their boards are read through the normal board rules (RLS
  // returns only boards the user may read), so a hospital may show no board at all.
  const links = [...project.project_hospitals].sort((a, b) => a.added_at.localeCompare(b.added_at));
  const hospitalIds = links.map((l) => l.hospital_id);
  const { data: boards, error: boardsError } = hospitalIds.length
    ? await supabase.from("sources").select("id, name, hospital_id").in("hospital_id", hospitalIds).order("name")
    : { data: [], error: null };
  const hospitals: HospitalRow[] = links.map((l) => ({
    id: l.hospital_id,
    name: l.hospitals?.name ?? "",
    boards: (boards ?? []).filter((b) => b.hospital_id === l.hospital_id).map((b) => ({ id: b.id, name: b.name })),
  }));
  const siteName = new Map((boards ?? []).map((b) => [b.id, b.name]));
  const readableIds = (boards ?? []).map((b) => b.id);

  // Every hospital not yet in the project, for the "add a hospital" list (any hospital may be added).
  const { data: allHospitals } = await supabase.from("hospitals").select("id, name").order("name");
  const linked = new Set(hospitalIds);
  const available = (allHospitals ?? []).filter((h) => !linked.has(h.id));

  const from = (page - 1) * PROJECT_PAGE_SIZE;
  const to = from + PROJECT_PAGE_SIZE - 1;
  const query = { view: view === "timeline" ? "timeline" : undefined };

  let body: React.ReactNode = null;
  let total = 0;
  let listError = false;

  if (boardsError) {
    listError = true;
  } else if (readableIds.length === 0) {
    body = <p className="text-sm opacity-70">{t(hospitalIds.length ? "noReadableBoardsInProject" : "addSitesFirst")}</p>;
  } else if (view === "documents") {
    // Newest change first, as on a source page (latest_version_id only grows).
    const { data: docs, count, error } = await supabase
      .from("documents")
      .select("id, title, source_id, status, posted_on, latest_version_id", { count: "exact" })
      .in("source_id", readableIds)
      .order("latest_version_id", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error?.code === "PGRST103") notFound();
    listError = Boolean(error);
    total = count ?? 0;
    const latestIds = (docs ?? []).flatMap((d) => (d.latest_version_id === null ? [] : [d.latest_version_id]));
    const { data: latest } = latestIds.length
      ? await supabase.from("document_versions").select("id, version_no, created_at").in("id", latestIds)
      : { data: [] };
    const latestById = new Map((latest ?? []).map((v) => [v.id, v]));
    body = !error && total === 0 ? (
      <p className="text-sm opacity-70">{t("noDocuments")}</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {docs?.map((doc) => {
          const v = doc.latest_version_id === null ? undefined : latestById.get(doc.latest_version_id);
          return (
            <li key={doc.id} className="rounded border p-4">
              <h3 className="font-medium">
                <Link href={`/documents/${doc.id}`} className="underline-offset-4 hover:underline">
                  {doc.title}
                </Link>
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{siteName.get(doc.source_id)}</span>
                {doc.status === "removed" && (
                  <span className="rounded bg-neutral-900 px-2 py-0.5 text-white">{t("removed")}</span>
                )}
                {doc.status === "needs_review" && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{t("needsReview")}</span>
                )}
                {v && <span className="opacity-70">{t("latestVersion", { n: v.version_no })}</span>}
                {v && <span className="ml-auto opacity-70">{t("changed", { date: date(v.created_at) })}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  } else {
    // Every stored change of the project's sites, newest first. "baseline" and "resaved" are
    // left out (silent first scan; bytes changed but not the text).
    const { data: versions, count, error } = await supabase
      .from("document_versions")
      .select("id, document_id, source_id, version_no, change_type, title, created_at", { count: "exact" })
      .in("source_id", readableIds)
      .in("change_type", [...TIMELINE_TYPES])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error?.code === "PGRST103") notFound();
    listError = Boolean(error);
    total = count ?? 0;
    body = !error && total === 0 ? (
      <p className="text-sm opacity-70">{t("noChanges")}</p>
    ) : (
      <ol className="flex flex-col gap-2 border-l pl-4">
        {versions?.map((v) => (
          <li key={v.id} className="relative text-sm">
            <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-neutral-400" />
            <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
              <time dateTime={v.created_at}>{date(v.created_at)}</time>
              <span>{siteName.get(v.source_id)}</span>
              <span
                className={`rounded px-1.5 py-0.5 ${v.change_type === "new" ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"}`}
              >
                {t(v.change_type === "new" ? "changeNew" : "changeUpdated")}
              </span>
            </div>
            <Link href={`/documents/${v.document_id}?v=${v.version_no}`} className="underline-offset-4 hover:underline">
              {v.title}
            </Link>{" "}
            <span className="text-xs opacity-70">{t("versionN", { n: v.version_no })}</span>
          </li>
        ))}
      </ol>
    );
  }

  const pages = pageCount(total, PROJECT_PAGE_SIZE);
  if (!listError && readableIds.length > 0 && page > pages) notFound();

  const tab = (target: "documents" | "timeline", label: string) => (
    <Link
      href={target === "timeline" ? `/projects/${projectId}?view=timeline` : `/projects/${projectId}`}
      aria-current={view === target ? "page" : undefined}
      className={`rounded px-3 py-1 text-sm ${view === target ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border"}`}
    >
      {label}
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Link href="/projects" className="text-sm underline-offset-4 hover:underline">
          ← {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {project.note && <p className="text-sm whitespace-pre-wrap opacity-80">{project.note}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t("sitesTitle")}</h2>
        <ProjectHospitals projectId={projectId} hospitals={hospitals} available={available} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t("pipelinesTitle")}</h2>
        <ProjectPipelines projectId={projectId} hospitals={hospitals.map((h) => ({ id: h.id, name: h.name }))} />
      </section>

      <section className="flex flex-col gap-3">
        <nav aria-label={t("viewLabel")} className="flex gap-2">
          {tab("documents", t("documentsTab"))}
          {tab("timeline", t("timelineTab"))}
        </nav>
        {listError && (
          <p role="alert" className="text-sm text-red-600">
            {t("documentsLoadError")}
          </p>
        )}
        {body}
        {!listError && (
          <Pagination page={page} pages={pages} pathname={`/projects/${projectId}`} query={query} />
        )}
      </section>

      <details className="rounded border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("settingsTitle")}</summary>
        <div className="mt-3">
          {/* No key from the saved values: a remount after saving would wipe the "Saved" message. */}
          <ProjectSettings id={projectId} name={project.name} note={project.note} />
        </div>
      </details>
    </main>
  );
}
