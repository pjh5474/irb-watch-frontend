// The filters of the overview page, kept in the address so links and the back button keep them.
//   src=1,2        sources (any of them)
//   pr=high,low    priority (changes only: documents have no priority)
//   type=new,...   change type (changes only)
//   days=30        period: changes in the last N days; new documents first seen in the last N
//   project=7      only the sites in one of the user's projects
// Unknown or malformed values are dropped, never guessed.

export const FEED_PAGE_SIZE = 5;
export const PRIORITIES = ["high", "medium", "low"] as const;
export const CHANGE_TYPES = ["new", "updated", "removed", "reappeared", "needs_review"] as const;
export const PERIODS = [7, 30, 90] as const;

export type FeedFilters = {
  sources: number[];
  priorities: string[];
  types: string[];
  days: number | null;
  project: number | null;
};

export const NO_FILTERS: FeedFilters = { sources: [], priorities: [], types: [], days: null, project: null };

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | undefined, allowed?: readonly string[]): string[] {
  const items = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const kept = allowed ? items.filter((s) => allowed.includes(s)) : items;
  return [...new Set(kept)];
}

function id(value: string | undefined): number | null {
  return value && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

export function parseFeedFilters(params: Params): FeedFilters {
  // "source" is the older single-source parameter; links that use it keep working.
  const sourceList = list(one(params.src) ?? one(params.source)).flatMap((s) => {
    const n = id(s);
    return n === null ? [] : [n];
  });
  const days = Number(one(params.days));
  return {
    sources: sourceList.slice(0, 50),
    priorities: list(one(params.pr), PRIORITIES),
    types: list(one(params.type), CHANGE_TYPES),
    days: (PERIODS as readonly number[]).includes(days) ? days : null,
    project: id(one(params.project)),
  };
}

/** The address parameters for these filters (empty ones left out). */
export function filterParams(f: FeedFilters): Record<string, string | undefined> {
  return {
    src: f.sources.length ? f.sources.join(",") : undefined,
    pr: f.priorities.length ? f.priorities.join(",") : undefined,
    type: f.types.length ? f.types.join(",") : undefined,
    days: f.days ? String(f.days) : undefined,
    project: f.project ? String(f.project) : undefined,
  };
}

export function isFiltered(f: FeedFilters): boolean {
  return Object.values(filterParams(f)).some(Boolean);
}

/** The source ids both filters allow: null = no limit; [] = nothing can match. */
export function allowedSources(f: FeedFilters, projectSources: number[] | null): number[] | null {
  let allowed: number[] | null = f.sources.length ? f.sources : null;
  if (f.project !== null) {
    const inProject = projectSources ?? [];
    allowed = allowed === null ? inProject : allowed.filter((s) => inProject.includes(s));
  }
  return allowed;
}

/** The start of the period as an ISO time, or null for "all". */
export function since(days: number | null, now: number = Date.now()): string | null {
  return days === null ? null : new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
