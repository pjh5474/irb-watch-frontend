// Paging helpers shared by the lists. Page numbers start at 1 and live in the address, so the
// back button and shared links keep working.

export const PAGE_SIZE = 10;

/** A page number from an address parameter; anything that is not a positive number is page 1. */
export function parsePage(value: string | undefined): number {
  return value && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1;
}

export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Keeps a page number inside 1..pages, so a stale link shows the last page, not an error. */
export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, page), pages);
}

/** The first and last row index (inclusive) of a page, for a database range() call. */
export function pageRange(page: number, size: number = PAGE_SIZE): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}

export type PageItem = number | "gap";

/**
 * The numbers to show in the pager: the first and last page, the current one and its
 * neighbours, with a gap marker where pages are left out. A gap of a single page shows that
 * page instead.
 */
export function pageItems(page: number, pages: number): PageItem[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  numbers.forEach((n, i) => {
    const before = numbers[i - 1];
    if (before !== undefined) {
      if (n - before === 2) items.push(before + 1);
      else if (n - before > 2) items.push("gap");
    }
    items.push(n);
  });
  return items;
}

/** The address of a page: `param` is left out for page 1; empty values in `query` are dropped. */
export function pageHref(
  pathname: string,
  query: Record<string, string | undefined>,
  param: string,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  if (page > 1) params.set(param, String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
