import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { clampPage, pageCount, pageRange, parsePage } from "@/lib/paging";
import { siteOf } from "@/lib/site-groups";
import { dataMayBeOld, isManual, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

// 24 cards fill whole rows of 2, 3 and 4 columns.
const GRID_PAGE_SIZE = 24;
const SHOWS = ["members", "attention", "project"] as const;
type Show = (typeof SHOWS)[number] | "";

export default async function SourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; show?: string; project?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam, q: qParam, show: showParam, project: projectParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("sources");
  const format = await getFormatter();
  const supabase = await createClient();
  const q = (qParam ?? "").trim().slice(0, 100);
  const show: Show = (SHOWS as readonly string[]).includes(showParam ?? "") ? (showParam as Show) : "";
  const projectId = projectParam && /^\d+$/.test(projectParam) ? Number(projectParam) : null;

  // All readable sources at once (a few hundred small rows), so search and the filters below
  // work on the whole list. Explicit safe columns: RLS cannot hide sources.config or
  // last_scan_error from users.
  const { data: all, error } = await supabase
    .from("sources")
    .select("id, name, url, adapter, requires_login, is_active, last_scan_at, last_scan_status, hospital_id")
    .order("name");
  const access = await getAccessState(supabase);
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_hospitals(hospital_id)")
    .order("name");
  if (!access) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }

  // A project lists hospitals; a board is "in the project" when its hospital is.
  const projectHospitals = new Set(
    (projects ?? []).find((p) => p.id === projectId)?.project_hospitals.map((l) => l.hospital_id) ?? [],
  );
  const inProject = new Set((all ?? []).filter((s) => projectHospitals.has(s.hospital_id)).map((s) => s.id));
  const term = q.toLowerCase();
  const matching = (all ?? []).filter((s) => {
    if (term && !s.name.toLowerCase().includes(term)) return false;
    if (show === "members" && !s.requires_login) return false;
    if (show === "attention" && !dataMayBeOld(sourceHealth(s).level)) return false;
    if (show === "project" && !inProject.has(s.id)) return false;
    return true;
  });
  const pages = pageCount(matching.length, GRID_PAGE_SIZE);
  const page = clampPage(parsePage(pageParam), pages);
  const [from, to] = pageRange(page, GRID_PAGE_SIZE);
  const visible = matching.slice(from, to + 1);

  // Document counts only for the cards on this page. null = locked or the count failed; the card
  // says which, so a failure never reads as "0".
  const counts = new Map<number, number | null>(
    await Promise.all(
      visible.map(async (s) => {
        if (isLocked(s, access)) return [s.id, null] as const;
        const { count, error: countError } = await supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("source_id", s.id);
        return [s.id, countError ? null : (count ?? 0)] as const;
      }),
    ),
  );

  const query = {
    q: q || undefined,
    show: show || undefined,
    project: show === "project" && projectId ? String(projectId) : undefined,
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {/* A plain GET form: works without JavaScript and keeps the filters in the address. */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 text-sm" role="search">
        <label className="flex flex-col gap-1">
          {t("search")}
          <input
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="w-64 rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          {t("show")}
          <select name="show" defaultValue={show} className="rounded border px-2 py-1">
            <option value="">{t("showAll")}</option>
            <option value="members">{t("showMembers")}</option>
            <option value="attention">{t("showAttention")}</option>
            {(projects ?? []).length > 0 && <option value="project">{t("showProject")}</option>}
          </select>
        </label>
        {(projects ?? []).length > 0 && (
          <label className="flex flex-col gap-1">
            {t("project")}
            <select name="project" defaultValue={projectId ?? ""} className="rounded border px-2 py-1">
              <option value="">-</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="rounded border px-3 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          {t("apply")}
        </button>
        {(q || show) && (
          <Link href="/sources" className="px-1 py-1 underline-offset-4 hover:underline">
            {t("reset")}
          </Link>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!error && (
        <p className="mt-4 text-sm opacity-70">{t("found", { n: matching.length, total: (all ?? []).length })}</p>
      )}
      {!error && (all ?? []).length === 0 && <p className="mt-2 text-sm opacity-70">{t("empty")}</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((source, index) => {
          const locked = isLocked(source, access);
          const count = counts.get(source.id) ?? null;
          const site = siteOf(source.url);
          return (
            <li
              key={source.id}
              className="reveal flex flex-col gap-2 rounded border p-4"
              style={{ "--i": index } as React.CSSProperties}
            >
              <h2 className="font-medium leading-snug">
                <Link href={`/sources/${source.id}`} className="underline-offset-4 hover:underline">
                  {source.name}
                </Link>
              </h2>
              <p className="text-xs opacity-60">
                {isManual(source) ? t("manualTag") : site.kind === "rbay" ? "R-BAY" : site.fallback}
              </p>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {locked ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{t("locked")}</span>
                ) : (
                  <span className="opacity-70">
                    {count === null ? t("countUnknown") : t("documentCount", { n: count })}
                  </span>
                )}
                {source.requires_login && !locked && (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {t("membersOnly")}
                  </span>
                )}
                {!source.is_active && (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-700">{t("inactive")}</span>
                )}
                {dataMayBeOld(sourceHealth(source).level) && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                    {t("mayBeOld")}
                  </span>
                )}
              </div>
              <p className="mt-auto text-xs opacity-70">
                {source.last_scan_at
                  ? t(isManual(source) ? "manualUpdated" : "lastScan", {
                      date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                    })
                  : t(isManual(source) ? "manualEmpty" : "neverScanned")}
              </p>
            </li>
          );
        })}
      </ul>

      {!error && <Pagination page={page} pages={pages} pathname="/sources" query={query} />}
    </main>
  );
}
