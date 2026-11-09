import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { clampPage, pageCount, pageRange } from "@/lib/paging";
import { recentCutoff, RECENT_DAYS } from "@/lib/recent";
import { dataMayBeOld, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

type SourceRef = {
  id: number;
  name: string;
  is_active: boolean;
  last_scan_at: string | null;
  last_scan_status: string | null;
};

// Per readable source: how many documents were first seen in the last RECENT_DAYS days and
// the titles of the three newest. Row-level security decides which sources and documents the
// user can see, so a study the user is not assigned to never shows up here.
export async function RecentDocuments({
  sources,
  sourcesFailed = false,
  page: requestedPage = 1,
  keep = {},
}: {
  sources: SourceRef[];
  // The list of sources itself could not be read: an empty list must not read as "nothing new".
  sourcesFailed?: boolean;
  // Which page of the cards to show (10 per page; a page past the end shows the last one).
  page?: number;
  // The other address parameters to keep in the page links (the source filter, the changes page).
  keep?: Record<string, string | undefined>;
}) {
  const t = await getTranslations("recent");
  const supabase = await createClient();
  const cutoff = recentCutoff();

  // Step 1: how many new documents each source has (cheap counts), so the pages are made of
  // sources that have something new. Step 2: the newest titles, only for the sources on this page.
  const counts = await Promise.all(
    sources.map(async (source) => {
      const counted = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("source_id", source.id)
        .gte("first_seen_at", cutoff);
      return { source, count: counted.count ?? 0, failed: Boolean(counted.error) };
    }),
  );
  const withCount = counts.filter((r) => r.count > 0);
  const pages = pageCount(withCount.length);
  const page = clampPage(requestedPage, pages);
  const [from, to] = pageRange(page);

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
  const failed = sourcesFailed || counts.some((r) => r.failed) || withNew.some((r) => r.failed);

  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm opacity-70">{t("hint", { days: RECENT_DAYS })}</p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!failed && withCount.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty", { days: RECENT_DAYS })}</p>}

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
