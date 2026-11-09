import { getFormatter, getTranslations } from "next-intl/server";
import { CountUp } from "@/components/count-up";
import { recentCutoff, RECENT_DAYS } from "@/lib/recent";
import { createClient } from "@/lib/supabase/server";

type SourceRef = { id: number; is_active: boolean; last_scan_at: string | null };

function Tile({
  label,
  value,
  hint,
  index,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  index: number;
}) {
  return (
    <div className="reveal rounded border p-3" style={{ "--i": index } as React.CSSProperties}>
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-1 text-xs opacity-60">{hint}</p>}
    </div>
  );
}

// A small overview for the top of the main page. Everything is counted through the signed-in
// user's own session, so row-level security decides what is included: a study the user is not
// assigned to is in no number. A count that could not be read shows "—" and a notice, never 0.
export async function Dashboard({ sources }: { sources: SourceRef[] | null }) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const supabase = await createClient();
  const cutoff = recentCutoff();

  const [saved, added, updated] = await Promise.all([
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("documents").select("id", { count: "exact", head: true }).gte("first_seen_at", cutoff),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("category", "document")
      .eq("event_type", "document.updated")
      .gte("created_at", cutoff),
  ]);

  // sources === null: the list of sources could not be read.
  const failed = Boolean(saved.error || added.error || updated.error) || sources === null;
  const number = (r: { count: number | null; error: unknown }) =>
    r.error || r.count === null ? "—" : <CountUp value={r.count} />;

  const watched = sources === null ? null : sources.filter((s) => s.is_active).length;
  const lastScan = (sources ?? [])
    .map((s) => s.last_scan_at)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);

  return (
    <section aria-label={t("title")} className="mt-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile index={0} label={t("saved")} value={number(saved)} />
        <Tile index={1} label={t("sources")} value={watched === null ? "—" : <CountUp value={watched} />} />
        <Tile index={2} label={t("added", { days: RECENT_DAYS })} value={number(added)} />
        <Tile index={3} label={t("updated", { days: RECENT_DAYS })} value={number(updated)} />
        <Tile
          index={4}
          label={t("lastScan")}
          value={
            sources === null
              ? "—"
              : lastScan
                ? format.dateTime(new Date(lastScan), { dateStyle: "medium" })
                : t("never")
          }
          hint={lastScan ? format.dateTime(new Date(lastScan), { timeStyle: "short" }) : undefined}
        />
      </dl>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}
    </section>
  );
}
