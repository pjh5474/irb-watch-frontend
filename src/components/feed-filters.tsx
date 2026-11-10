"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** The overview page's filter bar. Applying it changes the address (page numbers reset). */
export function FeedFilterBar({
  sources,
  projects,
  current,
}: {
  sources: Option[];
  projects: Option[];
  current: FeedFilters;
}) {
  const t = useTranslations("feed.filters");
  const tf = useTranslations("feed");
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<FeedFilters>(current);
  const [search, setSearch] = useState("");
  const names = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);

  const term = search.trim().toLowerCase();
  const matches = term
    ? sources.filter((s) => !draft.sources.includes(s.id) && s.name.toLowerCase().includes(term)).slice(0, MAX_MATCHES)
    : [];

  function go(filters: FeedFilters) {
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
      className="mt-4 flex flex-col gap-3 rounded border p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        go(draft);
      }}
      aria-label={t("label")}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="feed-source-search" className="font-medium">
          {t("sources")}
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {draft.sources.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
              {names.get(id) ?? `#${id}`}
              <button
                type="button"
                aria-label={t("removeSource", { name: names.get(id) ?? `#${id}` })}
                onClick={() => setDraft((d) => ({ ...d, sources: d.sources.filter((s) => s !== id) }))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            id="feed-source-search"
            className="min-w-48 flex-1 rounded border px-2 py-1"
            value={search}
            placeholder={draft.sources.length ? t("addMore") : tf("allSources")}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        {term && (
          <ul className="flex flex-col rounded border" aria-label={t("matches")}>
            {matches.length === 0 && <li className="px-2 py-1 opacity-70">{t("noMatch")}</li>}
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mr-2 font-medium">{t("priority")}</legend>
          {PRIORITIES.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={draft.priorities.includes(p)} onChange={() => toggle("priorities", p)} />
              {tf(`priority.${p}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mr-2 font-medium">{t("type")}</legend>
          {CHANGE_TYPES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input type="checkbox" checked={draft.types.includes(c)} onChange={() => toggle("types", c)} />
              {tf(`event.${c}`)}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t("period")}</span>
          <select
            className="rounded border px-2 py-1"
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
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t("project")}</span>
          <select
            className="rounded border px-2 py-1"
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
          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
          {isFiltered(current) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(NO_FILTERS);
                go(NO_FILTERS);
              }}
            >
              {t("reset")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs opacity-70">{t("note")}</p>
    </form>
  );
}
