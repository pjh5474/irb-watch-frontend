import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Dashboard } from "@/components/dashboard";
import { MarkdownText } from "@/components/markdown-text";
import { Pagination } from "@/components/pagination";
import { RecentDocuments } from "@/components/recent-documents";
import { SourceFilter } from "@/components/source-filter";
import { Link } from "@/i18n/navigation";
import { clampPage, pageCount, pageRange, parsePage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-neutral-100 text-neutral-700",
};

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ source?: string; cp?: string; rp?: string }>;
}) {
  const { locale } = await params;
  const { source, cp, rp } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("feed");
  const format = await getFormatter();
  const supabase = await createClient();

  // Explicit safe columns: RLS cannot hide sources.config / last_scan_error from users.
  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id, name, is_active, last_scan_at, last_scan_status")
    .order("id");
  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const sourceId = source && /^\d+$/.test(source) ? Number(source) : null;

  // The changes are paged by their own parameter (cp); the recent documents next to them have
  // theirs (rp). A page past the end shows the last page instead of an error.
  let countQuery = supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("category", "document");
  if (sourceId !== null) countQuery = countQuery.eq("source_id", sourceId);
  const { count: changeTotal, error: countError } = await countQuery;
  const changePages = pageCount(changeTotal ?? 0);
  const changePage = clampPage(parsePage(cp), changePages);
  const [from, to] = pageRange(changePage);

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, event_type, source_id, document_id, title, summary, priority, payload")
    .eq("category", "document")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (sourceId !== null) query = query.eq("source_id", sourceId);
  const { data: cards, error: listError } = await query;
  const error = countError ?? listError;

  // The audit log outlives the documents it describes (and RLS hides what a user may not
  // read), so link a card only when its document can really be opened.
  const documentIds = [...new Set((cards ?? []).flatMap((c) => (c.document_id === null ? [] : [c.document_id])))];
  const { data: openable } = documentIds.length
    ? await supabase.from("documents").select("id").in("id", documentIds)
    : { data: [] };
  const openableIds = new Set((openable ?? []).map((d) => d.id));

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <SourceFilter
          sources={(sources ?? []).map((s) => ({ id: s.id, name: s.name }))}
          current={sourceId}
        />
      </div>

      {/* The numbers cover everything the user may read, whatever the source filter says. */}
      <Dashboard sources={sourcesError ? null : (sources ?? [])} />

      {/* Wide screens: recently added documents on the left, changes on the right. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
        <RecentDocuments
          sources={(sources ?? []).filter((s) => sourceId === null || s.id === sourceId)}
          sourcesFailed={Boolean(sourcesError)}
          page={parsePage(rp)}
          keep={{ source: sourceId === null ? undefined : String(sourceId), cp: changePage > 1 ? String(changePage) : undefined }}
        />

        <section aria-labelledby="changes-title">
          <h2 id="changes-title" className="text-lg font-semibold">
            {t("changesTitle")}
          </h2>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {t("loadError")}
            </p>
          )}
          {!error && cards?.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty")}</p>}

          <ul className="mt-3 flex flex-col gap-3">
            {cards?.map((card, index) => {
              const payload = (card.payload ?? {}) as { version_no?: number };
              // event_type is "document.updated" etc.; message keys cannot contain dots.
              const eventKey = `event.${card.event_type.replace(/^document\./, "")}` as const;
              return (
                <li
                  key={card.id}
                  className="reveal rounded border p-4"
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-neutral-900 px-2 py-0.5 text-white">
                      {t.has(eventKey) ? t(eventKey) : card.event_type}
                    </span>
                    {card.priority && (
                      <span className={`rounded px-2 py-0.5 ${PRIORITY_STYLE[card.priority]}`}>
                        {t(`priority.${card.priority}`)}
                      </span>
                    )}
                    {card.source_id !== null && (
                      <span className="opacity-70">{names.get(card.source_id) ?? ""}</span>
                    )}
                    {payload.version_no !== undefined && (
                      <span className="opacity-70">{t("version", { n: payload.version_no })}</span>
                    )}
                    <time className="ml-auto opacity-70" dateTime={card.created_at}>
                      {format.dateTime(new Date(card.created_at), { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </div>
                  <h3 className="mt-2 font-medium">
                    {card.document_id !== null && openableIds.has(card.document_id) ? (
                      <Link
                        href={`/documents/${card.document_id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {card.title}
                      </Link>
                    ) : (
                      card.title
                    )}
                  </h3>
                  {card.document_id !== null && !openableIds.has(card.document_id) && (
                    <p className="mt-1 text-xs opacity-60">{t("documentGone")}</p>
                  )}
                  {card.summary ? (
                    <MarkdownText className="mt-1 opacity-80">{card.summary}</MarkdownText>
                  ) : (
                    <p className="mt-1 text-sm opacity-80">{t("noSummary")}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {!error && (
            <Pagination
              page={changePage}
              pages={changePages}
              pathname="/"
              param="cp"
              query={{
                source: sourceId === null ? undefined : String(sourceId),
                rp: parsePage(rp) > 1 ? String(parsePage(rp)) : undefined,
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}
