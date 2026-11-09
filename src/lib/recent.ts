// "New" documents are the ones IRB Watch first saw within this many days. This is the date
// the server stored the document (documents.first_seen_at), not the hospital's post date, so
// documents found by a source's very first scan count as new until they are this old.
export const RECENT_DAYS = 30;

export function recentCutoff(now: number = Date.now()): string {
  return new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// The Sources pages show only the new documents when the address carries ?new=1.
export function wantsOnlyNew(value: string | undefined): boolean {
  return value === "1";
}
