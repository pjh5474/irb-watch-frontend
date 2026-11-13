import { apiFetch } from "@/lib/api/client";

// Sharing a project (phase B1): members, PM, owner. Served by the backend; the project itself
// (name, note, hospitals) is still read and written through Supabase under RLS.

/** owner | manage (organization admin) | pm | edit (member) | read (platform admin support). */
export type ProjectAccess = "owner" | "manage" | "pm" | "edit" | "read";

export type PersonRef = { id: string; name: string };

export type Sharing = {
  project_id: number;
  access: ProjectAccess;
  owner: PersonRef | null;
  members: { user: PersonRef; role: "pm" | "member"; in_organization: boolean }[];
  can_manage_members: boolean;
  can_manage: boolean;
  is_member: boolean;
};

export type SharedProject = { project_id: number; name: string; owner: PersonRef | null; role: "pm" | "member" };

export type OrgProject = { project_id: number; name: string; owner: PersonRef | null; pm: PersonRef | null; members: number };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const base = (id: number) => `/projects/${id}`;

export const projectApi = {
  sharing: (id: number) => apiFetch<Sharing>(`${base(id)}/sharing`),
  candidates: (id: number) => apiFetch<PersonRef[]>(`${base(id)}/candidates`),
  addMember: (id: number, userId: string) => apiFetch<Sharing>(`${base(id)}/members`, json("POST", { user_id: userId })),
  removeMember: (id: number, userId: string) =>
    apiFetch<Sharing>(`${base(id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  setPm: (id: number, userId: string | null) => apiFetch<Sharing>(`${base(id)}/pm`, json("PUT", { user_id: userId })),
  handOver: (id: number, userId: string, keepAsMember: boolean) =>
    apiFetch<Sharing>(`${base(id)}/hand-over`, json("POST", { user_id: userId, keep_as_member: keepAsMember })),
  leave: (id: number) => apiFetch<void>(`${base(id)}/leave`, { method: "POST" }),
  shared: () => apiFetch<SharedProject[]>("/projects/shared"),
  organization: (organizationId?: string) =>
    apiFetch<OrgProject[]>(`/organization/projects${organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : ""}`),
};

export const canEdit = (access: ProjectAccess | undefined) => access !== undefined && access !== "read";
