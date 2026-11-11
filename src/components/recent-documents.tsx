import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { FEED_PAGE_SIZE, since } from "@/lib/feed-filters";
import { clampPage, pageCount, pageRange } from "@/lib/paging";
import { RECENT_DAYS } from "@/lib/recent";
import { dataMayBeOld, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

type SourceRef = {
  id: number;
  name: string;
  is_active: boolean;
  last_scan_at: string | null;
  last_scan_status: string | null;
  adapter?: string; // "manual": filled by hand, never "may be old"
};

// More new documents than this in one period is not expected; the count says "at least" then.
const MAX_ROWS = 5000;

// Per source: how many documents were first seen in the period (RECENT_DAYS unless the page's
// period filter says otherwise) and the titles of the three newest. Row-level security decides
// which sources and documents the user can see, so a study the user is not assigned to never
// shows up here.
export async function RecentDocuments({
  sources,
  sourcesFailed = false,
  days = null,
  page: requestedPage = 1,
  keep = {},
}: {
  sources: SourceRef[];
  // The list of sources itself could not be read: an empty list must not read as "nothing new".
  sourcesFailed?: boolean;
  days?: number | null;
  // Which page of the cards to show (FEED_PAGE_SIZE per page; past the end shows the last one).
  page?: number;
  // The other address parameters to keep in the page links (the filters, the changes page).
  keep?: Record<string, string | undefined>;
}) {
  const t = await getTranslations("recent");
  const supabase = await createClient();
  const period = days ?? RECENT_DAYS;
  const cutoff = since(period) as string; // a number of days always gives a time

  // One query for the whole period (just source ids), counted here: with hundreds of sources a
  // count per source would be hundreds of requests on every page load.
  const ids = sources.map((s) => s.id);
  const recent = ids.length
    ? await supabase
        .from("documents")
        .select("source_id")
        .in("source_id", ids)
        .gte("first_seen_at", cutoff)
        .limit(MAX_ROWS)
    : { data: [], error: null };
  const counts = new Map<number, number>();
  for (const row of recent.data ?? []) counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);

  const withCount = sources
    .filter((s) => (counts.get(s.id) ?? 0) > 0)
    .map((source) => ({ source, count: counts.get(source.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.source.name.localeCompare(b.source.name, "ko"));
  const pages = pageCount(withCount.length, FEED_PAGE_SIZE);
  const page = clampPage(requestedPage, pages);
  const [from, to] = pageRange(page, FEED_PAGE_SIZE);

  const withNew = await Promise.all(
    withCount.slice(from, to + 1).map(async ({ source, count }) => {
      const newest = await supabase
        .from("documents")
        .select("id, title")
        .eq("source_id", source.id)
        .gte("first_seen_at", cutoff)
        .order("first_seen_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(3);
      return { source, count, latest: newest.data ?? [], failed: Boolean(newest.error) };
    }),
  );

  // A failed lookup is shown as a failure, never as "nothing new".
  const failed = sourcesFailed || Boolean(recent.error) || withNew.some((r) => r.failed);

  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm opacity-70">{t("hint", { days: period })}</p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!failed && withCount.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty", { days: period })}</p>}

      <ul className="mt-3 flex flex-col gap-3">
        {withNew.map(({ source, count, latest }, index) => (
          <li
            key={source.id}
            className="reveal rounded border p-4"
            style={{ "--i": index } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/sources/${source.id}?new=1`} className="font-medium underline-offset-4 hover:underline">
                {source.name}
              </Link>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-100">
                {t("count", { n: count })}
              </span>
              {dataMayBeOld(sourceHealth(source).level) && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                  {t("mayBeOld")}
                </span>
              )}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {latest.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/documents/${doc.id}`} className="underline-offset-4 hover:underline">
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
            {count > latest.length && (
              <Link href={`/sources/${source.id}?new=1`} className="mt-2 inline-block text-sm underline-offset-4 hover:underline">
                {t("showAll", { n: count })}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <Pagination page={page} pages={pages} pathname="/" param="rp" query={keep} />
    </section>
  );
}
