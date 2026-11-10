"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { startNavProgress } from "@/components/nav-progress";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  CHANGE_TYPES,
  filterParams,
  isFiltered,
  NO_FILTERS,
  PERIODS,
  PRIORITIES,
  type FeedFilters,
} from "@/lib/feed-filters";

type Option = { id: number; name: string };

const MAX_MATCHES = 8;

const fieldClass =
  "h-9 w-full min-w-40 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const PRIORITY_STYLE: Record<(typeof PRIORITIES)[number], string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-neutral-100 text-neutral-700",
};

/** The overview page's filter bar. Applying it changes the address (page numbers reset). */
export function FeedFilterBar({
  sources,
  projects,
  current,
  paging = false,
}: {
  sources: Option[];
  projects: Option[];
  current: FeedFilters;
  // True when a list is past its first page. Applying the same filters still reloads, to drop that page.
  paging?: boolean;
}) {
  const t = useTranslations("feed.filters");
  const tf = useTranslations("feed");
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<FeedFilters>(current);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<"apply" | "reset" | null>(null);
  const names = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);
  const applied = JSON.stringify(filterParams(current));
  // The bar stays mounted when only the page number changes, so a new address ends the spinner.
  const address = `${applied}:${paging}`;
  const [pendingFor, setPendingFor] = useState(address);
  if (address !== pendingFor) {
    setPendingFor(address);
    setPending(null);
  }

  const term = search.trim().toLowerCase();
  const matches = term
    ? sources.filter((s) => !draft.sources.includes(s.id) && s.name.toLowerCase().includes(term)).slice(0, MAX_MATCHES)
    : [];

  function go(filters: FeedFilters, action: "apply" | "reset") {
    const same = JSON.stringify(filterParams(filters)) === applied;
    if (same && !paging) return;
    setPending(action);
    startNavProgress();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filterParams(filters))) if (value) params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function toggle(key: "priorities" | "types", value: string) {
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));
  }

  return (
    <form
      className="mt-6 overflow-hidden rounded-md border border-border bg-card text-sm text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      onSubmit={(e) => {
        e.preventDefault();
        go(draft, "apply");
      }}
      aria-label={t("label")}
      aria-busy={pending !== null}
    >
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="feed-source-search" className="text-xs font-medium text-muted-foreground">
            {t("sources")}
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            {draft.sources.map((id) => (
              <span
                key={id}
                className="inline-flex h-7 items-center gap-1 rounded border border-border bg-muted px-2 text-xs text-foreground"
              >
                {names.get(id) ?? `#${id}`}
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label={t("removeSource", { name: names.get(id) ?? `#${id}` })}
                  onClick={() => setDraft((d) => ({ ...d, sources: d.sources.filter((s) => s !== id) }))}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
            <input
              id="feed-source-search"
              className="h-7 min-w-48 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
              value={search}
              placeholder={draft.sources.length ? t("addMore") : tf("allSources")}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          {term ? (
            <ul className="overflow-hidden rounded-md border border-border bg-popover shadow-sm" aria-label={t("matches")}>
              {matches.length === 0 ? <li className="px-3 py-2 text-muted-foreground">{t("noMatch")}</li> : null}
              {matches.map((s) => (
                <li key={s.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setDraft((d) => ({ ...d, sources: [...d.sources, s.id] }));
                      setSearch("");
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-5 border-t border-border pt-4 lg:grid-cols-2">
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("priority")}</legend>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <label
                  key={p}
                  className={`inline-flex cursor-pointer items-center rounded px-2 py-1 text-sm ring-1 ring-transparent has-checked:ring-2 has-checked:ring-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${PRIORITY_STYLE[p]}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={draft.priorities.includes(p)}
                    onChange={() => toggle("priorities", p)}
                  />
                  {tf(`priority.${p}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("type")}</legend>
            <div className="flex flex-wrap gap-2">
              {CHANGE_TYPES.map((c) => (
                <label
                  key={c}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 has-checked:border-foreground has-checked:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-foreground"
                    checked={draft.types.includes(c)}
                    onChange={() => toggle("types", c)}
                  />
                  {tf(`event.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("period")}</span>
            <select
              className={fieldClass}
              value={draft.days ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, days: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">{t("allTime")}</option>
              {PERIODS.map((n) => (
                <option key={n} value={n}>
                  {t("lastDays", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("project")}</span>
            <select
              className={fieldClass}
              value={draft.project ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, project: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">{t("anyProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={pending !== null} aria-busy={pending === "apply"}>
              {pending === "apply" && <Spinner aria-hidden />}
              {t("apply")}
            </Button>
            {isFiltered(current) ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={pending !== null}
                aria-busy={pending === "reset"}
                onClick={() => {
                  setDraft(NO_FILTERS);
                  go(NO_FILTERS, "reset");
                }}
              >
                {pending === "reset" && <Spinner aria-hidden />}
                {t("reset")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <p className="border-t border-border bg-muted/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground sm:px-5">
        {t("note")}
      </p>
    </form>
  );
}
