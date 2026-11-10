import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Dashboard } from "@/components/dashboard";
import { FeedFilterBar } from "@/components/feed-filters";
import { MarkdownText } from "@/components/markdown-text";
import { Pagination } from "@/components/pagination";
import { RecentDocuments } from "@/components/recent-documents";
import { Link } from "@/i18n/navigation";
import { allowedSources, FEED_PAGE_SIZE, filterParams, parseFeedFilters, since } from "@/lib/feed-filters";
import { pageCount, parsePage } from "@/lib/paging";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("feed");
  const format = await getFormatter();
  const supabase = await createClient();
  const filters = parseFeedFilters(query);
  const cp = typeof query.cp === "string" ? query.cp : undefined;
  const rp = typeof query.rp === "string" ? query.rp : undefined;

  // Explicit safe columns: RLS cannot hide sources.config / last_scan_error from users.
  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id, name, is_active, last_scan_at, last_scan_status")
    .order("name");
  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));

  // The user's own projects (row-level security), for the "only my project's sites" filter.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_sources(source_id)")
    .order("name");
  const project = (projects ?? []).find((p) => p.id === filters.project);
  const allowed = allowedSources(filters, project ? project.project_sources.map((l) => l.source_id) : null);
  const from = since(filters.days);

  // The changes, filtered in the database. One query returns the page and the total; a page past
  // the end is read again as the last page instead of showing an error.
  async function loadChanges(page: number) {
    let q = supabase
      .from("audit_logs")
      .select("id, created_at, event_type, source_id, document_id, title, summary, priority, payload", {
        count: "exact",
      })
      .eq("category", "document");
    if (allowed !== null) q = q.in("source_id", allowed);
    if (filters.priorities.length) q = q.in("priority", filters.priorities);
    if (filters.types.length) q = q.in("event_type", filters.types.map((type) => `document.${type}`));
    if (from) q = q.gte("created_at", from);
    const start = (page - 1) * FEED_PAGE_SIZE;
    return q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + FEED_PAGE_SIZE - 1);
  }

  const nothingCanMatch = allowed !== null && allowed.length === 0;
  let changePage = parsePage(cp);
  let changes = nothingCanMatch ? null : await loadChanges(changePage);
  let changePages = pageCount(changes?.count ?? 0, FEED_PAGE_SIZE);
  if (changes && (changes.error?.code === "PGRST103" || changePage > changePages)) {
    changePage = changePages;
    changes = await loadChanges(changePage);
    changePages = pageCount(changes.count ?? 0, FEED_PAGE_SIZE);
  }
  const cards = changes?.data ?? [];
  const error = changes?.error ?? null;

  // The audit log outlives the documents it describes (and RLS hides what a user may not
  // read), so link a card only when its document can really be opened.
  const documentIds = [...new Set(cards.flatMap((c) => (c.document_id === null ? [] : [c.document_id])))];
  const { data: openable } = documentIds.length
    ? await supabase.from("documents").select("id").in("id", documentIds)
    : { data: [] };
  const openableIds = new Set((openable ?? []).map((d) => d.id));

  const keep = filterParams(filters);
  const recentSources = (sources ?? []).filter((s) => allowed === null || allowed.includes(s.id));

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {/* The numbers cover everything the user may read, whatever the filters say. */}
      <Dashboard sources={sourcesError ? null : (sources ?? [])} />

      <FeedFilterBar
        // A new address (filters applied elsewhere, back button) starts the bar fresh.
        key={JSON.stringify(keep)}
        sources={(sources ?? []).map((s) => ({ id: s.id, name: s.name }))}
        projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
        current={filters}
        paging={changePage > 1 || parsePage(rp) > 1}
      />

      {/* Wide screens: recently added documents on the left, changes on the right.
          data-nav-pending (set while a filter or page link is loading) dims this block. */}
      <div className="relative mt-8" data-feed-results>
        <div className="pointer-events-none absolute inset-x-0 top-10 z-10 hidden justify-center in-data-[nav-pending=true]:flex">
          <span
            className="size-6 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground motion-reduce:animate-none"
            aria-hidden
          />
        </div>
        <div className="grid gap-8 transition-opacity lg:grid-cols-2 lg:items-start in-data-[nav-pending=true]:pointer-events-none in-data-[nav-pending=true]:opacity-50">
        <RecentDocuments
          sources={recentSources}
          sourcesFailed={Boolean(sourcesError)}
          days={filters.days}
          page={parsePage(rp)}
          keep={{ ...keep, cp: changePage > 1 ? String(changePage) : undefined }}
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
          {!error && cards.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty")}</p>}

          <ul className="mt-3 flex flex-col gap-3">
            {cards.map((card, index) => {
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
              query={{ ...keep, rp: parsePage(rp) > 1 ? String(parsePage(rp)) : undefined }}
            />
          )}
        </section>
        </div>
      </div>
    </main>
  );
}
