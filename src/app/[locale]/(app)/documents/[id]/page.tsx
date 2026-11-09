import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DiffView } from "@/components/diff-view";
import { FileList, type FileRow } from "@/components/file-list";
import { MarkdownText } from "@/components/markdown-text";
import { SummaryPanel } from "@/components/summary-panel";
import { Link } from "@/i18n/navigation";
import { getAccessState } from "@/lib/access";
import { wordDiff } from "@/lib/diff";
import { formatPageText } from "@/lib/page-text";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { locale, id } = await params;
  const { v } = await searchParams;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  const documentId = Number(id);

  const t = await getTranslations("doc");
  const format = await getFormatter();
  const supabase = await createClient();

  // RLS decides what is readable: a document the user may not see simply comes back empty.
  const { data: document } = await supabase
    .from("documents")
    .select("id, title, source_id, source_url, posted_on, status, review_reason")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) notFound();

  // For the "back to the board" link. Name only: the other source columns are not needed.
  const { data: source } = await supabase
    .from("sources")
    .select("name")
    .eq("id", document.source_id)
    .maybeSingle();

  // UI hint only (shows the admin's re-summarize button); the server re-checks the role.
  const access = await getAccessState(supabase);

  // "resaved" versions (bytes changed, text did not) are hidden from users.
  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, version_no, change_type, title, created_at, summary, priority, document_summary")
    .eq("document_id", documentId)
    .neq("change_type", "resaved")
    .order("version_no", { ascending: false });
  if (!versions || versions.length === 0) notFound();

  const wanted = v && /^\d+$/.test(v) ? Number(v) : null;
  const index = Math.max(0, versions.findIndex((x) => x.version_no === wanted));
  const selected = versions[index];
  const previous = versions[index + 1] ?? null;

  const { data: bodies } = await supabase
    .from("document_versions")
    .select("id, body_text")
    .in("id", previous ? [selected.id, previous.id] : [selected.id]);
  // Line breaks added for reading only; both sides of the diff are formatted alike.
  const body = (vid: number) => formatPageText(bodies?.find((b) => b.id === vid)?.body_text ?? "");

  const { data: fileRows } = await supabase
    .from("document_version_files")
    .select("id, filename, size_label, storage_path, extract_note, hash_only_reason")
    .eq("version_id", selected.id)
    .order("filename");
  const files: FileRow[] = (fileRows ?? []).map((f) => ({
    id: f.id,
    filename: f.filename,
    size_label: f.size_label,
    hasOriginal: f.storage_path !== null,
    note: f.extract_note ?? (f.hash_only_reason ? t("textUnavailable") : null),
  }));

  const parts = previous ? wordDiff(body(previous.id), body(selected.id)) : null;
  const titleChanged = previous !== null && previous.title !== selected.title;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← {t("back")}
          </Link>
          <Link
            href={`/sources/${document.source_id}`}
            className="underline-offset-4 hover:underline"
          >
            ← {source?.name ?? t("backToSource")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">{document.title}</h1>
        <div className="flex flex-wrap gap-3 text-sm opacity-70">
          {document.posted_on && <span>{document.posted_on}</span>}
          {document.status === "removed" && <span>{t("removed")}</span>}
          <a href={document.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            {t("original")}
          </a>
        </div>
        {document.status === "needs_review" && document.review_reason && (
          <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            {t("needsReview")}: {document.review_reason}
          </p>
        )}
      </header>

      <section aria-label={t("versions")}>
        <h2 className="mb-2 font-medium">{t("versions")}</h2>
        <ul className="flex flex-wrap gap-2">
          {versions.map((ver) => (
            <li key={ver.id}>
              <Link
                href={`/documents/${documentId}?v=${ver.version_no}`}
                aria-current={ver.id === selected.id ? "true" : undefined}
                className={`block rounded border px-3 py-1 text-sm ${
                  ver.id === selected.id ? "bg-neutral-900 text-white" : ""
                }`}
              >
                {t("version", { n: ver.version_no })} ·{" "}
                {format.dateTime(new Date(ver.created_at), { dateStyle: "medium" })}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {selected.summary && (
        <section>
          <h2 className="mb-2 font-medium">{t("changeSummary")}</h2>
          <div className="rounded border bg-muted/40 p-3">
            <MarkdownText>{selected.summary}</MarkdownText>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">{previous ? t("changes", { from: previous.version_no, to: selected.version_no }) : t("text")}</h2>
        {titleChanged && (
          <p className="mb-2 text-sm">
            <del className="bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100">{previous.title}</del>{" "}
            <ins className="bg-green-100 text-green-900 no-underline dark:bg-green-900/40 dark:text-green-100">{selected.title}</ins>
          </p>
        )}
        {previous && parts ? (
          <DiffView parts={parts} />
        ) : (
          <>
            {previous && <p className="mb-2 text-sm opacity-70">{t("diffTooLarge")}</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{body(selected.id)}</p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t("files")}</h2>
        <FileList files={files} />
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t("wholeSummary")}</h2>
        <SummaryPanel
          key={selected.id}
          documentId={documentId}
          cachedSummary={selected.document_summary}
          canRegenerate={Boolean(access?.isAdmin) && index === 0}
        />
        {/* Built from our own data, never from the AI's text: the post and the attachments
            the summary is based on. */}
        <aside className="mt-4 text-sm">
          <h3 className="font-medium">{t("references")}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <a href={document.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                {t("original")}
              </a>
              <span className="opacity-70"> · {document.title}</span>
            </li>
            {files.map((f) => (
              <li key={f.id} className="opacity-80">
                {f.filename}
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
