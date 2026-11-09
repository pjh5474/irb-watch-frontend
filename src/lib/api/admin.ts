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
};

export type SourceMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  added_at: string | null;
};

export type StoredLogin = { owner_label: string; site: string; updated_at: string | null };

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

// The name a SNUH board's stored login is filed under: snuh-<board key> (the ?key= number in
// the board address). Null when the address has no key.
export function loginSite(sourceUrl: string): string | null {
  try {
    const key = new URL(sourceUrl).searchParams.get("key");
    return key && /^\d+$/.test(key) ? `snuh-${key}` : null;
  } catch {
    return null;
  }
}
