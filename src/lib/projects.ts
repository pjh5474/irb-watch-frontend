// User projects: a user's private folder of IRB sites under a name. The browser writes the rows
// directly; row-level security lets only the owner see or change them and allows adding only
// sites the user can already read. The limits below mirror the database (migration
// user_projects), so most mistakes are caught before a request is sent.

export const MAX_NAME = 100;
export const MAX_NOTE = 1000;
export const MAX_PROJECTS = 50;
export const MAX_SITES = 30;
export const PROJECT_PAGE_SIZE = 30;

export type ProjectProblem = "nameEmpty" | "nameLong" | "noteLong";

/** What is wrong with a name and note before saving, or null when they can be saved. */
export function projectProblem(name: string, note: string): ProjectProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return "nameEmpty";
  if (trimmed.length > MAX_NAME) return "nameLong";
  if (note.length > MAX_NOTE) return "noteLong";
  return null;
}

export type ProjectErrorKey =
  | "nameTaken"
  | "tooManyProjects"
  | "tooManySites"
  | "notAllowed"
  | "invalid"
  | "hasPipelines"
  | "saveError";

/**
 * The message key for a failed write. Supabase errors carry the Postgres code: 23505 = the
 * name is already used, P0001 = a limit from the trigger, 42501 = row-level security refused
 * (the site is not readable, or the project is not the user's), 23514 = a check failed.
 */
export function projectErrorKey(error: unknown): ProjectErrorKey {
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code === "23505") return "nameTaken";
  // "at most 30 hospitals per project" (was "... sites ..." before hospitals, 2026-11-12).
  if (e.code === "P0001") return /hospitals|sites/.test(e.message ?? "") ? "tooManySites" : "tooManyProjects";
  if (e.code === "42501") return "notAllowed";
  if (e.code === "23514") return "invalid";
  // 23503: a project with IRB pipelines (removed ones too, until purged) cannot be deleted.
  if (e.code === "23503") return "hasPipelines";
  return "saveError";
}

/** The note as stored: blank becomes null. */
export function cleanNote(note: string): string | null {
  return note.trim() ? note : null;
}

/** The "view" address parameter of a project page: the documents list or the change timeline. */
export type ProjectView = "documents" | "timeline";

export function parseView(value: string | undefined): ProjectView {
  return value === "timeline" ? "timeline" : "documents";
}

/**
 * Change types shown in the timeline. "baseline" (first scan, kept silent everywhere) and
 * "resaved" (bytes changed, text did not) are left out, as on the document page.
 */
export const TIMELINE_TYPES = ["new", "updated"] as const;
