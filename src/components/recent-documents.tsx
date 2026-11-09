import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { recentCutoff, RECENT_DAYS } from "@/lib/recent";
import { createClient } from "@/lib/supabase/server";

type SourceRef = { id: number; name: string };

// Per readable source: how many documents were first seen in the last RECENT_DAYS days and
// the titles of the three newest. Row-level security decides which sources and documents the
// user can see, so a study the user is not assigned to never shows up here.
export async function RecentDocuments({ sources }: { sources: SourceRef[] }) {
  const t = await getTranslations("recent");
  const supabase = await createClient();
  const cutoff = recentCutoff();

  const rows = await Promise.all(
    sources.map(async (source) => {
      const [counted, newest] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("source_id", source.id)
          .gte("first_seen_at", cutoff),
        supabase
          .from("documents")
          .select("id, title")
          .eq("source_id", source.id)
          .gte("first_seen_at", cutoff)
          .order("first_seen_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(3),
      ]);
      return {
        source,
        count: counted.count ?? 0,
        latest: newest.data ?? [],
        failed: Boolean(counted.error || newest.error),
      };
    }),
  );

  // A failed lookup is shown as a failure, never as "nothing new".
  const failed = rows.some((r) => r.failed);
  const withNew = rows.filter((r) => r.count > 0);

  return (
    <section aria-labelledby="recent-title" className="mt-6">
      <h2 id="recent-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm opacity-70">{t("hint", { days: RECENT_DAYS })}</p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!failed && withNew.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty", { days: RECENT_DAYS })}</p>}

      <ul className="mt-3 flex flex-col gap-3">
        {withNew.map(({ source, count, latest }) => (
          <li key={source.id} className="rounded border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/sources/${source.id}?new=1`} className="font-medium underline">
                {source.name}
              </Link>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-100">
                {t("count", { n: count })}
              </span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {latest.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/documents/${doc.id}`} className="underline">
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
            {count > latest.length && (
              <Link href={`/sources/${source.id}?new=1`} className="mt-2 inline-block text-sm underline">
                {t("showAll", { n: count })}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
