import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Pagination } from "@/components/pagination";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { clampPage, pageCount, pageRange, parsePage } from "@/lib/paging";
import { dataMayBeOld, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

export default async function SourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("sources");
  const format = await getFormatter();
  const supabase = await createClient();

  // How many sources the user may read (row-level security decides), so the page can be clamped:
  // a stale link shows the last page instead of an error.
  const { count: total, error: countError } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true });
  const pages = pageCount(total ?? 0);
  const page = clampPage(parsePage(pageParam), pages);
  const [from, to] = pageRange(page);

  // Explicit safe columns: RLS cannot hide sources.config / last_scan_error from users.
  const { data: sources, error: listError } = await supabase
    .from("sources")
    .select("id, name, requires_login, is_active, last_scan_at, last_scan_status")
    .order("id")
    .range(from, to);
  const error = countError ?? listError;
  const access = await getAccessState(supabase);
  if (!access) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }

  // null = locked or the count failed; the card says which, so a failure never reads as "0".
  const counts = new Map<number, number | null>(
    await Promise.all(
      (sources ?? []).map(async (s) => {
        if (isLocked(s, access)) return [s.id, null] as const;
        const { count, error: countError } = await supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("source_id", s.id);
        return [s.id, countError ? null : (count ?? 0)] as const;
      }),
    ),
  );

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!error && sources?.length === 0 && <p className="mt-6 text-sm opacity-70">{t("empty")}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {sources?.map((source, index) => {
          const locked = isLocked(source, access);
          const count = counts.get(source.id) ?? null;
          return (
            <li
              key={source.id}
              className="reveal rounded border p-4"
              style={{ "--i": index } as React.CSSProperties}
            >
              <h2 className="font-medium">
                <Link href={`/sources/${source.id}`} className="underline-offset-4 hover:underline">
                  {source.name}
                </Link>
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {locked ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{t("locked")}</span>
                ) : (
                  <span className="opacity-70">
                    {count === null ? t("countUnknown") : t("documentCount", { n: count })}
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
                <span className="ml-auto opacity-70">
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
            </li>
          );
        })}
      </ul>

      {!error && <Pagination page={page} pages={pages} pathname="/sources" />}
    </main>
  );
}
