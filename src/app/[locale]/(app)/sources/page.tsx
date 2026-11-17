import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { groupByHospital, tabLabel } from "@/lib/hospital-boards";
import { clampPage, pageCount, pageRange, parsePage } from "@/lib/paging";
import { myProjectsFilter } from "@/lib/project-scope";
import { dataMayBeOld, isManual, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

// 24 cards fill whole rows of 2, 3 and 4 columns.
const GRID_PAGE_SIZE = 24;
const SHOWS = ["members", "attention", "project"] as const;
type Show = (typeof SHOWS)[number] | "";

/** One card per hospital (owner, 2026-11-17): its boards inside, opening the hospital page. */
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
  const th = await getTranslations("hospitalPage");
  const format = await getFormatter();
  const supabase = await createClient();
  const q = (qParam ?? "").trim().slice(0, 100);
  const show: Show = (SHOWS as readonly string[]).includes(showParam ?? "") ? (showParam as Show) : "";
  const projectId = projectParam && /^\d+$/.test(projectParam) ? Number(projectParam) : null;

  // All readable boards and the hospital names at once (a few hundred small rows), so search and
  // the filters below work on the whole list. Explicit safe columns: row-level security cannot
  // hide sources.config or last_scan_error from users.
  const [{ data: all, error }, { data: hospitalRows, error: hospitalsError }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, name, url, adapter, requires_login, is_active, last_scan_at, last_scan_status, hospital_id, board_kind")
      .order("name"),
    supabase.from("hospitals").select("id, name"),
  ]);
  const access = await getAccessState(supabase);
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_hospitals(hospital_id)")
    .or(await myProjectsFilter(supabase))
    .order("name");
  if (!access || hospitalsError) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }

  const hospitalNames = new Map((hospitalRows ?? []).map((h) => [h.id, h.name]));
  // A project lists hospitals; a hospital is "in the project" when the project lists it.
  const projectHospitals = new Set(
    (projects ?? []).find((p) => p.id === projectId)?.project_hospitals.map((l) => l.hospital_id) ?? [],
  );
  const term = q.toLowerCase();
  const groups = groupByHospital(all ?? [], hospitalNames).filter((g) => {
    if (term && !g.name.toLowerCase().includes(term) && !g.boards.some((b) => b.name.toLowerCase().includes(term)))
      return false;
    if (show === "members" && !g.boards.some((b) => b.requires_login)) return false;
    if (show === "attention" && !g.boards.some((b) => dataMayBeOld(sourceHealth(b).level))) return false;
    if (show === "project" && !(g.hospitalId !== null && projectHospitals.has(g.hospitalId))) return false;
    return true;
  });
  const totalGroups = groupByHospital(all ?? [], hospitalNames).length;
  const pages = pageCount(groups.length, GRID_PAGE_SIZE);
  const page = clampPage(parsePage(pageParam), pages);
  const [from, to] = pageRange(page, GRID_PAGE_SIZE);
  const visible = groups.slice(from, to + 1);

  // Document counts only for the boards of the cards on this page. null = locked or the count
  // failed; the card says which, so a failure never reads as "0".
  const boardsOnPage = visible.flatMap((g) => g.boards);
  const counts = new Map<number, number | null>(
    await Promise.all(
      boardsOnPage.map(async (s) => {
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
  const kindName = (kind: string) => th(`kind.${kind}` as "kind.other");

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{t("hospitals")}</h1>

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

      {(error || hospitalsError) && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!error && <p className="mt-4 text-sm opacity-70">{t("found", { n: groups.length, total: totalGroups })}</p>}
      {!error && (all ?? []).length === 0 && <p className="mt-2 text-sm opacity-70">{t("empty")}</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((group, index) => {
          const href = group.hospitalId !== null ? `/hospitals/${group.hospitalId}` : `/sources/${group.boards[0].id}`;
          const readable = group.boards.filter((b) => !isLocked(b, access));
          const known = readable.map((b) => counts.get(b.id)).filter((c): c is number => typeof c === "number");
          // A count that failed for a readable board is not a number: say "unknown", never a short total.
          const countFailed = readable.some((b) => counts.get(b.id) === null);
          const total = known.reduce((a, b) => a + b, 0);
          const allLocked = readable.length === 0;
          const lastScan = group.boards.map((b) => b.last_scan_at).filter((d): d is string => Boolean(d)).sort().at(-1);
          const allManual = group.boards.every((b) => isManual(b));
          return (
            <li
              key={group.hospitalId ?? `board-${group.boards[0].id}`}
              className="reveal flex flex-col gap-2 rounded border p-4"
              style={{ "--i": index } as React.CSSProperties}
            >
              <h2 className="font-medium leading-snug">
                <Link href={href} className="underline-offset-4 hover:underline">
                  {group.name}
                </Link>
              </h2>
              <p className="text-xs opacity-60">{t("hospitalBoards", { n: group.boards.length })}</p>
              <ul className="flex flex-wrap gap-1 text-xs">
                {group.boards.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={group.hospitalId !== null ? `/hospitals/${group.hospitalId}?board=${b.id}` : `/sources/${b.id}`}
                      className="rounded bg-neutral-100 px-2 py-0.5 hover:underline dark:bg-neutral-800"
                    >
                      {tabLabel(b, group.boards, kindName)}
                      {isLocked(b, access) ? " 🔒" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {allLocked ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{t("locked")}</span>
                ) : (
                  <span className="opacity-70">
                    {countFailed ? t("countUnknown") : t("hospitalDocuments", { n: total })}
                  </span>
                )}
                {group.boards.some((b) => !b.is_active) && (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-700">{t("inactive")}</span>
                )}
                {group.boards.some((b) => dataMayBeOld(sourceHealth(b).level)) && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                    {t("mayBeOld")}
                  </span>
                )}
              </div>
              <p className="mt-auto text-xs opacity-70">
                {lastScan
                  ? t(allManual ? "manualUpdated" : "lastScan", {
                      date: format.dateTime(new Date(lastScan), { dateStyle: "medium", timeStyle: "short" }),
                    })
                  : t(allManual ? "manualEmpty" : "neverScanned")}
              </p>
            </li>
          );
        })}
      </ul>

      {!error && <Pagination page={page} pages={pages} pathname="/sources" query={query} />}
    </main>
  );
}
