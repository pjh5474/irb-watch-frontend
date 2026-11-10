import { apiFetch } from "@/lib/api/client";

// Admin endpoints of the backend. Typed by hand because the generated API types
// (`npm run gen:api-types`) do not include the study routes until the backend that has them
// is deployed; replace these with the generated schemas then.

export type AdminSource = {
  id: number;
  name: string;
  adapter: string;
  url: string;
  needs_browser: boolean;
  is_active: boolean;
  created_at: string;
  last_scan_at: string | null;
  last_scan_status: string | null;
  last_scan_error: string | null;
  scan_in_progress: boolean;
  login_user: string | null;
  requires_login: boolean;
  scans_paused_reason: string | null;
  ai_enabled: boolean;
  // Where the server files this source's stored login: snuh-<board key>, or
  // rbay-<hospital code> (one login per R-BAY hospital). Older servers do not send it.
  login_site?: string | null;
};

export type SourceMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  added_at: string | null;
};

export type StoredLogin = { owner_label: string; site: string; updated_at: string | null };

// A document in "needs review". file_warning: only file problems (too big to download,
// unreadable, a broken zip), which an admin may mark OK; false = the post failed to load.
export type ReviewItem = {
  document_id: number;
  source_id: number;
  source_name: string;
  title: string;
  review_reason: string;
  file_warning: boolean;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const adminApi = {
  sources: () => apiFetch<AdminSource[]>("/admin/sources"),
  createSource: (body: { name: string; url: string; login_user?: string | null }) =>
    apiFetch<AdminSource>("/admin/sources", json("POST", body)),
  updateSource: (
    id: number,
    body: Partial<{ name: string; is_active: boolean; login_user: string; ai_enabled: boolean }>,
  ) => apiFetch<AdminSource>(`/admin/sources/${id}`, json("PATCH", body)),
  scanSource: (id: number) => apiFetch<{ status: string }>(`/admin/sources/${id}/scan`, { method: "POST" }),
  scanAll: () => apiFetch<{ status: string }>("/admin/scans/run-all", { method: "POST" }),
  // The chosen sources, with the daily run's rules (one site at a time, never in parallel).
  scanSelected: (ids: number[]) =>
    apiFetch<{ status: string; count: number }>("/admin/scans/run-selected", json("POST", { source_ids: ids })),
  // A short mail to the calling admin's own address, to check the mail settings.
  sendTestMail: () => apiFetch<{ status: string }>("/admin/mail/test", { method: "POST" }),
  // The weekly usage report for the last 7 days, sent to the calling admin's own address only.
  sendWeeklyPreview: () => apiFetch<{ status: string }>("/admin/mail/weekly-preview", { method: "POST" }),
  reviews: () => apiFetch<ReviewItem[]>("/admin/documents/reviews"),
  // The document's file warnings are OK: it leaves "needs review" until the warning changes.
  reviewOk: (documentId: number) =>
    apiFetch<ReviewItem>(`/admin/documents/${documentId}/review-ok`, { method: "POST" }),
  // Writes the whole-document summary again and replaces the saved one for everyone.
  resummarize: (documentId: number) =>
    apiFetch<{ summary: string; version_no: number; replaced: boolean }>(
      `/admin/documents/${documentId}/summary`,
      { method: "POST" },
    ),

  members: (id: number) => apiFetch<SourceMember[]>(`/admin/sources/${id}/members`),
  addMember: (id: number, email: string) =>
    apiFetch<SourceMember>(`/admin/sources/${id}/members`, json("PUT", { email })),
  removeMember: (id: number, userId: string) =>
    apiFetch<void>(`/admin/sources/${id}/members/${userId}`, { method: "DELETE" }),

  logins: () => apiFetch<StoredLogin[]>("/admin/credentials"),
  saveLogin: (label: string, site: string, loginId: string, password: string) =>
    apiFetch<StoredLogin>(
      `/admin/credentials/${encodeURIComponent(label)}/${encodeURIComponent(site)}`,
      json("PUT", { login_id: loginId, password }),
    ),
  deleteLogin: (label: string, site: string) =>
    apiFetch<void>(`/admin/credentials/${encodeURIComponent(label)}/${encodeURIComponent(site)}`, {
      method: "DELETE",
    }),
};

// The name a source's stored login is filed under. The server says it (login_site), so the two
// can never disagree: snuh-<board key>, or rbay-<hospital code> (an R-BAY account can enter
// only the hospitals it is registered with, so each hospital has its own login, shared by its
// boards). Without it (an older server) a SNUH address still gives snuh-<the ?key= number>.
// Null when no site name is known.
export function loginSite(source: Pick<AdminSource, "url" | "login_site">): string | null {
  if (source.login_site) return source.login_site;
  try {
    const key = new URL(source.url).searchParams.get("key");
    return key && /^\d+$/.test(key) ? `snuh-${key}` : null;
  } catch {
    return null;
  }
}

export function isRbaySite(site: string | null): boolean {
  return Boolean(site?.startsWith("rbay-"));
}
