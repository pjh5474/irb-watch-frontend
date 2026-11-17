import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HospitalContacts } from "@/components/hospital-contacts";
import { SourceDocuments } from "@/components/source-documents";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { orderBoards, pickBoard, tabLabel } from "@/lib/hospital-boards";
import { pageHref, parsePage } from "@/lib/paging";
import { RECENT_DAYS, wantsOnlyNew } from "@/lib/recent";
import { dataMayBeOld, isManual, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

/**
 * One hospital in one place: its IRB office contacts, then its boards (notices, forms,
 * regulations, ...) as tabs. A members-only board the user may not read keeps its tab with a
 * lock note (owner, 2026-11-17); the documents of each board stay gated per board.
 */
export default async function HospitalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ board?: string; page?: string; new?: string; q?: string }>;
}) {
  const { locale, id } = await params;
  const { board: boardParam, page: pageParam, new: newParam, q: qParam } = await searchParams;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  const hospitalId = Number(id);
  const page = parsePage(pageParam);
  const onlyNew = wantsOnlyNew(newParam);
  const q = (qParam ?? "").trim().slice(0, 100);

  const t = await getTranslations("hospitalPage");
  const ts = await getTranslations("sources");
  const format = await getFormatter();
  const supabase = await createClient();

  const [hospital, boardsResult, access] = await Promise.all([
    supabase.from("hospitals").select("id, name").eq("id", hospitalId).maybeSingle(),
    // Explicit safe columns: row-level security cannot hide sources.config / last_scan_error.
    supabase
      .from("sources")
      .select("id, name, adapter, requires_login, is_active, last_scan_at, last_scan_status, hospital_id, board_kind")
      .eq("hospital_id", hospitalId),
    getAccessState(supabase),
  ]);
  if (hospital.error || boardsResult.error || !access) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!hospital.data) notFound();

  const boards = orderBoards(boardsResult.data ?? []);
  const current = pickBoard(boards, boardParam);
  const locked = current ? isLocked(current, access) : false;
  const kindName = (kind: string) => t(`kind.${kind}` as "kind.other");
  const base = `/hospitals/${hospitalId}`;
  const keep: Record<string, string> = current ? { board: String(current.id) } : {};

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Link href="/sources" className="text-sm underline-offset-4 hover:underline">
          ← {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold">{hospital.data.name}</h1>
      </header>

      <HospitalContacts hospitalId={hospitalId} canEdit={access.isAdmin} />

      {boards.length === 0 ? (
        <p className="text-sm opacity-70">{t("noBoards")}</p>
      ) : (
        <>
          <nav aria-label={t("boardTabs")} className="flex flex-wrap gap-1 border-b">
            {boards.map((b) => {
              const active = b.id === current?.id;
              return (
                <Link
                  key={b.id}
                  href={`${base}?board=${b.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px rounded-t border px-3 py-1.5 text-sm ${
                    active
                      ? "border-b-background bg-background font-medium"
                      : "border-transparent opacity-70 hover:bg-neutral-100 hover:opacity-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {tabLabel(b, boards, kindName)}
                  {isLocked(b, access) && <span className="ml-1 text-xs opacity-70">· {t("lockedTab")}</span>}
                </Link>
              );
            })}
          </nav>

          {current && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                  {onlyNew ? ts("viewingNew", { days: RECENT_DAYS }) : ts("viewingAll")}
                </span>
                {!locked && (
                  <Link
                    href={pageHref(base, { ...keep, q: q || undefined, new: onlyNew ? undefined : "1" }, "page", 1)}
                    className="underline-offset-4 hover:underline"
                  >
                    {onlyNew ? ts("showAllDocuments") : ts("showOnlyNew", { days: RECENT_DAYS })}
                  </Link>
                )}
                <Link href={`/sources/${current.id}`} className="underline-offset-4 hover:underline">
                  {current.name}
                </Link>
              </div>
              {dataMayBeOld(sourceHealth(current).level) && (
                <p className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  {ts("mayBeOldLong")}
                </p>
              )}
              <p className="opacity-70">
                {!current.is_active && <span className="mr-3">{ts("inactive")}</span>}
                {isManual(current)
                  ? current.last_scan_at
                    ? ts("manualUpdated", {
                        date: format.dateTime(new Date(current.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                      })
                    : ts("manualEmpty")
                  : current.last_scan_at
                    ? ts("lastScan", {
                        date: format.dateTime(new Date(current.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                      })
                    : ts("neverScanned")}
              </p>
            </div>
          )}

          {current && locked && (
            <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{ts("lockedNote")}</p>
          )}
          {current && !locked && (
            <SourceDocuments
              supabase={supabase}
              sourceId={current.id}
              pathname={base}
              page={page}
              q={q}
              onlyNew={onlyNew}
              keep={keep}
            />
          )}
        </>
      )}
    </main>
  );
}
