import { apiFetch } from "@/lib/api/client";

// Organizations (platform admins only). An organization groups users and is the unit for
// statistics; it never grants access. One organization per user.

export type Organization = {
  id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
  member_count: number; // deleted accounts included
  is_default: boolean;
};

export type OrgMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
  deleted_at: string | null;
};

export const METRICS = ["chat_messages", "summaries", "drafts", "revisions", "exports", "downloads"] as const;
export type Metric = (typeof METRICS)[number];
export type Counts = Record<Metric, number>;

export type OrgTotals = {
  organization_id: string;
  name: string;
  deleted: boolean;
  members: number;
  new_accounts: number;
  signed_in: number;
  counts: Counts;
};

export type MonthStats = { month: string; organizations: OrgTotals[] };

export type UserTotals = {
  user_id: string;
  email: string | null;
  member_now: boolean;
  last_sign_in_at: string | null;
  counts: Counts;
};

export type OrgStats = { month: string; organization: Organization; totals: OrgTotals; users: UserTotals[] };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const orgApi = {
  list: (includeDeleted = false) =>
    apiFetch<Organization[]>(`/admin/organizations${includeDeleted ? "?include_deleted=true" : ""}`),
  create: (name: string) => apiFetch<Organization>("/admin/organizations", json("POST", { name })),
  rename: (id: string, name: string) => apiFetch<Organization>(`/admin/organizations/${id}`, json("PATCH", { name })),
  remove: (id: string) => apiFetch<Organization>(`/admin/organizations/${id}`, { method: "DELETE" }),
  restore: (id: string) => apiFetch<Organization>(`/admin/organizations/${id}/restore`, { method: "POST" }),
  members: (id: string) => apiFetch<OrgMember[]>(`/admin/organizations/${id}/members`),
  moveUser: (userId: string, organizationId: string) =>
    apiFetch<unknown>(`/admin/users/${userId}/organization`, json("PUT", { organization_id: organizationId })),
  monthStats: (month: string) => apiFetch<MonthStats>(`/admin/organizations/stats?month=${month}`),
  orgStats: (id: string, month: string) => apiFetch<OrgStats>(`/admin/organizations/${id}/stats?month=${month}`),
};

/** This month in Seoul time (the server counts calendar months in SCAN_TIMEZONE), as YYYY-MM. */
export function currentMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}`;
}
