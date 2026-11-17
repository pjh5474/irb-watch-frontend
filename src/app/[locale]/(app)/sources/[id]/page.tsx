import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SourceDocuments } from "@/components/source-documents";
import { Link } from "@/i18n/navigation";
import { getAccessState, isLocked } from "@/lib/access";
import { pageHref, parsePage } from "@/lib/paging";
import { RECENT_DAYS, wantsOnlyNew } from "@/lib/recent";
import { dataMayBeOld, isManual, sourceHealth } from "@/lib/source-health";
import { createClient } from "@/lib/supabase/server";

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string; new?: string; q?: string }>;
}) {
  const { locale, id } = await params;
  const { page: pageParam, new: newParam, q: qParam } = await searchParams;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  const sourceId = Number(id);
  const page = parsePage(pageParam);
  const onlyNew = wantsOnlyNew(newParam);
  const q = (qParam ?? "").trim().slice(0, 100);

  const t = await getTranslations("sources");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, name, adapter, requires_login, is_active, last_scan_at, last_scan_status, hospital_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!source) notFound();

  const access = await getAccessState(supabase);
  if (!access) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  const locked = isLocked(source, access);

  const header = (
    <header className="flex flex-col gap-2">
      <Link href="/sources" className="text-sm underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{source.name}</h1>
      {source.hospital_id !== null && (
        <Link href={`/hospitals/${source.hospital_id}`} className="text-sm underline-offset-4 hover:underline">
          {t("allBoardsOfHospital")}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
          {onlyNew ? t("viewingNew", { days: RECENT_DAYS }) : t("viewingAll")}
        </span>
        <Link
          href={pageHref(`/sources/${sourceId}`, { q: q || undefined, new: onlyNew ? undefined : "1" }, "page", 1)}
          className="underline-offset-4 hover:underline"
        >
          {onlyNew ? t("showAllDocuments") : t("showOnlyNew", { days: RECENT_DAYS })}
        </Link>
      </div>
      {dataMayBeOld(sourceHealth(source).level) && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {t("mayBeOldLong")}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-sm opacity-70">
        {!source.is_active && <span>{t("inactive")}</span>}
        <span>
          {isManual(source)
            ? source.last_scan_at
              ? t("manualUpdated", {
                  date: format.dateTime(new Date(source.last_scan_at), { dateStyle: "medium", timeStyle: "short" }),
                })
              : t("manualEmpty")
            : source.last_scan_at
              ? t("lastScan", {
                  date: format.dateTime(new Date(source.last_scan_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })
              : t("neverScanned")}
        </span>
      </div>
    </header>
  );

  if (locked) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        {header}
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          {t("lockedNote")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      {header}
      <SourceDocuments
        supabase={supabase}
        sourceId={sourceId}
        pathname={`/sources/${sourceId}`}
        page={page}
        q={q}
        onlyNew={onlyNew}
      />
    </main>
  );
}
