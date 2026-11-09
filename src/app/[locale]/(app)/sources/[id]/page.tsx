import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { parsePage } from "@/lib/paging";
import { RECENT_DAYS, recentCutoff, wantsOnlyNew } from "@/lib/recent";
import { dataMayBeOld, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

// One source's documents stay 50 per page (the owner asked for 10 on the other lists).
const PAGE_SIZE = 50;

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string; new?: string }>;
}) {
  const { locale, id } = await params;
  const { page: pageParam, new: newParam } = await searchParams;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  const sourceId = Number(id);
  const page = parsePage(pageParam);
  const onlyNew = wantsOnlyNew(newParam);

  const t = await getTranslations("sources");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, name, requires_login, is_active, last_scan_at, last_scan_status")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!source) notFound();

  const access = await getAccessState(supabase);
  if (!access) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  const locked = isLocked(source, access);

  const header = (
    <header className="flex flex-col gap-2">
      <Link href="/sources" className="text-sm underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{source.name}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
          {onlyNew ? t("viewingNew", { days: RECENT_DAYS }) : t("viewingAll")}
        </span>
        <Link
          href={onlyNew ? `/sources/${sourceId}` : `/sources/${sourceId}?new=1`}
          className="underline-offset-4 hover:underline"
        >
          {onlyNew ? t("showAllDocuments") : t("showOnlyNew", { days: RECENT_DAYS })}
        </Link>
      </div>
      {dataMayBeOld(sourceHealth(source).level) && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {t("mayBeOldLong")}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-sm opacity-70">
        {!source.is_active && <span>{t("inactive")}</span>}
        <span>
          {source.last_scan_at
            ? t("lastScan", {
                date: format.dateTime(new Date(source.last_scan_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })
            : t("neverScanned")}
        </span>
      </div>
    </header>
  );

  if (locked) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        {header}
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          {t("lockedNote")}
        </p>
      </main>
    );
  }

  // Newest change first: latest_version_id only grows, so it orders documents by their most
  // recent stored version (a silent re-save of a file also counts). Paged in the database.
  const from = (page - 1) * PAGE_SIZE;
  let docsQuery = supabase
    .from("documents")
    .select("id, title, posted_on, status, latest_version_id", { count: "exact" })
    .eq("source_id", sourceId);
  // "New" = first seen by IRB Watch within RECENT_DAYS (see lib/recent.ts).
  if (onlyNew) docsQuery = docsQuery.gte("first_seen_at", recentCutoff());
  const { data: docs, count, error } = await docsQuery
    .order("latest_version_id", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // A start row past the last one makes PostgREST answer 416 (PGRST103) with no count: that
  // is a page that does not exist, not a server failure.
  if (error?.code === "PGRST103") notFound();
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (!error && page > pages) notFound();

  const latestIds = (docs ?? []).flatMap((d) => (d.latest_version_id === null ? [] : [d.latest_version_id]));
  const { data: latest } = latestIds.length
    ? await supabase.from("document_versions").select("id, created_at").in("id", latestIds)
    : { data: [] };
  const changedAt = new Map((latest ?? []).map((v) => [v.id, v.created_at]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      {header}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t("documentsLoadError")}
        </p>
      )}
      {!error && total === 0 && (
        <p className="text-sm opacity-70">
          {onlyNew ? t("noNewDocuments", { days: RECENT_DAYS }) : t("noDocuments")}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {docs?.map((doc, index) => {
          const changed = doc.latest_version_id === null ? null : changedAt.get(doc.latest_version_id);
          return (
            <li
              key={doc.id}
              className="reveal rounded border p-4"
              style={{ "--i": index } as React.CSSProperties}
            >
              <h2 className="font-medium">
                <Link href={`/documents/${doc.id}`} className="underline-offset-4 hover:underline">
                  {doc.title}
                </Link>
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {doc.status === "removed" && (
                  <span className="rounded bg-neutral-900 px-2 py-0.5 text-white">{t("removed")}</span>
                )}
                {doc.status === "needs_review" && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{t("needsReview")}</span>
                )}
                {doc.posted_on && <span className="opacity-70">{t("posted", { date: doc.posted_on })}</span>}
                {changed && (
                  <span className="ml-auto opacity-70">
                    {t("changed", { date: format.dateTime(new Date(changed), { dateStyle: "medium" }) })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!error && (
        <Pagination
          page={page}
          pages={pages}
          pathname={`/sources/${sourceId}`}
          query={{ new: onlyNew ? "1" : undefined }}
        />
      )}
    </main>
  );
}
