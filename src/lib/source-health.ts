// How healthy a source's scanning is, from fields the server already keeps on `sources`.
// A scan sets `last_scan_at` only when it saved its results, so after a failed scan the date
// stays on the last good one and `last_scan_status` says what went wrong.

export const STALE_HOURS = 36; // the daily scan runs at 06:00 with one retry an hour later

export type HealthLevel =
  | "ok" // last scan saved, and recently
  | "scanning" // a scan is running now
  | "attention" // failed once (often temporary), or no good scan for STALE_HOURS
  | "problem" // a person must act: login rejected and scans paused, or the page layout changed
  | "idle" // never scanned yet
  | "inactive"; // switched off by an admin

export type HealthReason = "paused" | "needsReview" | "failed" | "stale" | null;

export type HealthInput = {
  is_active: boolean;
  last_scan_at: string | null;
  last_scan_status: string | null;
  // Admin-only fields. Normal users cannot read them, so for them "paused" shows up as
  // needs_review (a rejected login sets that status as well).
  scan_in_progress?: boolean;
  scans_paused_reason?: string | null;
};

export function sourceHealth(
  s: HealthInput,
  now: number = Date.now(),
): { level: HealthLevel; reason: HealthReason } {
  if (!s.is_active) return { level: "inactive", reason: null };
  if (s.scan_in_progress) return { level: "scanning", reason: null };
  if (s.scans_paused_reason) return { level: "problem", reason: "paused" };
  if (s.last_scan_status === "needs_review") return { level: "problem", reason: "needsReview" };
  if (s.last_scan_status === "failed") return { level: "attention", reason: "failed" };
  if (s.last_scan_at === null) return { level: "idle", reason: null };

  const last = Date.parse(s.last_scan_at);
  if (Number.isNaN(last) || now - last > STALE_HOURS * 60 * 60 * 1000) {
    return { level: "attention", reason: "stale" };
  }
  return { level: "ok", reason: null };
}

// Normal users get one plain warning, no detail: the data of this source may be out of date.
export function dataMayBeOld(level: HealthLevel): boolean {
  return level === "attention" || level === "problem";
}
