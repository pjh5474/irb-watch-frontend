import { apiFetch } from "@/lib/api/client";

// Admin user management (platform admins only). Accounts are made by an admin with a temporary
// password; delete is soft (the login is blocked) and can be undone.

export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "user" | "admin" | string;
  created_at: string;
  deleted_at: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

export type UserPage = { items: AdminUser[]; total: number; limit: number; offset: number };

export type NewUser = {
  email: string;
  password: string;
  display_name: string | null;
  role: "user" | "admin";
  organization_id: string | null;
};

export const MIN_PASSWORD = 8;
export const PAGE_SIZE = 50;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const usersApi = {
  list: (offset: number, includeDeleted: boolean) =>
    apiFetch<UserPage>(
      `/admin/users?limit=${PAGE_SIZE}&offset=${offset}${includeDeleted ? "&include_deleted=true" : ""}`,
    ),
  create: (body: NewUser) => apiFetch<AdminUser>("/admin/users", json("POST", body)),
  setRole: (id: string, role: "user" | "admin") => apiFetch<AdminUser>(`/admin/users/${id}/role`, json("PATCH", { role })),
  remove: (id: string) => apiFetch<AdminUser>(`/admin/users/${id}`, { method: "DELETE" }),
  restore: (id: string) => apiFetch<AdminUser>(`/admin/users/${id}/restore`, { method: "POST" }),
  move: (id: string, organizationId: string) =>
    apiFetch<AdminUser>(`/admin/users/${id}/organization`, json("PUT", { organization_id: organizationId })),
};

/** What is wrong with the form before it is sent, or null. */
export function newUserProblem(u: NewUser): "email" | "password" | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email.trim())) return "email";
  if (u.password.length < MIN_PASSWORD) return "password";
  return null;
}
