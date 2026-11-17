import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { containsPattern } from "@/lib/like";
import { PAGE_SIZE, pageCount, pageHref, pageRange } from "@/lib/paging";
import { RECENT_DAYS, recentCutoff } from "@/lib/recent";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * One board's documents: a title search, the newest posts first (board date, then id; undated
 * last: a first scan stores a board's posts newest first, so ids run backwards) and 10 per page.
 * Used by the source page and by each tab of the hospital page; `keep` are the address
 * parameters that must survive a search or a page change (the hospital page's chosen tab).
 */
export async function SourceDocuments({
  supabase,
  sourceId,
  pathname,
  page,
  q,
  onlyNew,
  keep = {},
}: {
  supabase: Client;
  sourceId: number;
  pathname: string;
  page: number;
  q: string;
  onlyNew: boolean;
  keep?: Record<string, string>;
}) {
  const t = await getTranslations("sources");
  const format = await getFormatter();
  const listQuery = { ...keep, q: q || undefined, new: onlyNew ? "1" : undefined };

  const [from, to] = pageRange(page, PAGE_SIZE);
  let docsQuery = supabase
    .from("documents")
    .select("id, title, posted_on, status, latest_version_id", { count: "exact" })
    .eq("source_id", sourceId);
  // "New" = first seen by IRB Watch within RECENT_DAYS (see lib/recent.ts).
  if (onlyNew) docsQuery = docsQuery.gte("first_seen_at", recentCutoff());
  if (q) docsQuery = docsQuery.ilike("title", containsPattern(q));
  const { data: docs, count, error } = await docsQuery
    .order("posted_on", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, to);

  // A start row past the last one makes PostgREST answer 416 (PGRST103) with no count: that
  // is a page that does not exist, not a server failure.
  if (error?.code === "PGRST103") notFound();
  const total = count ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  if (!error && page > pages) notFound();

  const latestIds = (docs ?? []).flatMap((d) => (d.latest_version_id === null ? [] : [d.latest_version_id]));
  const { data: latest } = latestIds.length
    ? await supabase.from("document_versions").select("id, created_at").in("id", latestIds)
    : { data: [] };
  const changedAt = new Map((latest ?? []).map((v) => [v.id, v.created_at]));

  return (
    <div className="flex flex-col gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm" role="search">
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {onlyNew ? <input type="hidden" name="new" value="1" /> : null}
        <label className="flex flex-col gap-1">
          {t("search")}
          <input
            name="q"
            defaultValue={q}
            placeholder={t("documentSearchPlaceholder")}
            className="w-64 rounded border px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          {t("apply")}
        </button>
        {q ? (
          <Link
            href={pageHref(pathname, { ...keep, new: onlyNew ? "1" : undefined }, "page", 1)}
            className="px-1 py-1 underline-offset-4 hover:underline"
          >
            {t("reset")}
          </Link>
        ) : null}
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t("documentsLoadError")}
        </p>
      )}
      {!error && <p className="text-sm opacity-70">{t("documentCount", { n: total })}</p>}
      {!error && total === 0 && (
        <p className="text-sm opacity-70">
          {q ? t("noMatches") : onlyNew ? t("noNewDocuments", { days: RECENT_DAYS }) : t("noDocuments")}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {docs?.map((doc, index) => {
          const changed = doc.latest_version_id === null ? null : changedAt.get(doc.latest_version_id);
          return (
            <li key={doc.id} className="reveal rounded border p-4" style={{ "--i": index } as React.CSSProperties}>
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

      {!error && <Pagination page={page} pages={pages} pathname={pathname} query={listQuery} />}
    </div>
  );
}
