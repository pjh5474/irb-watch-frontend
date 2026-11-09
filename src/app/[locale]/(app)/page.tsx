import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { MarkdownText } from "@/components/markdown-text";
import { RecentDocuments } from "@/components/recent-documents";
import { SourceFilter } from "@/components/source-filter";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

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
  searchParams: Promise<{ source?: string }>;
}) {
  const { locale } = await params;
  const { source } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("feed");
  const format = await getFormatter();
  const supabase = await createClient();

  // Explicit safe columns: RLS cannot hide sources.config / last_scan_error from users.
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name")
    .order("id");
  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const sourceId = source && /^\d+$/.test(source) ? Number(source) : null;

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, event_type, source_id, document_id, title, summary, priority, payload")
    .eq("category", "document")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (sourceId !== null) query = query.eq("source_id", sourceId);
  const { data: cards, error } = await query;

  // The audit log outlives the documents it describes (and RLS hides what a user may not
  // read), so link a card only when its document can really be opened.
  const documentIds = [...new Set((cards ?? []).flatMap((c) => (c.document_id === null ? [] : [c.document_id])))];
  const { data: openable } = documentIds.length
    ? await supabase.from("documents").select("id").in("id", documentIds)
    : { data: [] };
  const openableIds = new Set((openable ?? []).map((d) => d.id));

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <SourceFilter
          sources={(sources ?? []).map((s) => ({ id: s.id, name: s.name }))}
          current={sourceId}
        />
      </div>

      <RecentDocuments
        sources={(sources ?? []).filter((s) => sourceId === null || s.id === sourceId)}
      />

      <h2 className="mt-8 text-lg font-semibold">{t("changesTitle")}</h2>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
      {!error && cards?.length === 0 && <p className="mt-3 text-sm opacity-70">{t("empty")}</p>}

      <ul className="mt-3 flex flex-col gap-3">
        {cards?.map((card) => {
          const payload = (card.payload ?? {}) as { version_no?: number };
          // event_type is "document.updated" etc.; message keys cannot contain dots.
          const eventKey = `event.${card.event_type.replace(/^document\./, "")}` as const;
          return (
            <li key={card.id} className="rounded border p-4">
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
              <h2 className="mt-2 font-medium">
                {card.document_id !== null && openableIds.has(card.document_id) ? (
                  <Link href={`/documents/${card.document_id}`} className="underline">
                    {card.title}
                  </Link>
                ) : (
                  card.title
                )}
              </h2>
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
    </main>
  );
}
