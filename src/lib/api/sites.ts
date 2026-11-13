import { apiFetch } from "@/lib/api/client";

// Sites per PI (phase B2a): one IRB track of a project (hospital + optional PI + optional site
// number) and its details with a dated history. Served by the backend.

export type Site = {
  id: number;
  project_id: number;
  hospital_id: number;
  site_no: string;
  pi_name: string;
  note: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FactEntry = {
  id: number;
  value: string; // "" = the detail was removed
  valid_from: string;
  step_id: number | null;
  corrects: number | null; // this entry fixes that one
  corrected: boolean; // another entry replaces this one
  changed_by: string | null; // a name
  created_at: string;
};

export type SiteFact = { name: string; current: FactEntry | null; upcoming: FactEntry[]; history: FactEntry[] };

export type SiteFacts = { site: Site; facts: SiteFact[]; suggested: string[] };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const siteApi = {
  list: (projectId: number, includeRemoved = false) =>
    apiFetch<Site[]>(`/projects/${projectId}/sites${includeRemoved ? "?include_removed=true" : ""}`),
  create: (projectId: number, body: { hospital_id: number; pi_name: string; site_no: string }) =>
    apiFetch<Site>(`/projects/${projectId}/sites`, json("POST", body)),
  update: (id: number, body: Partial<{ site_no: string; note: string }>) => apiFetch<Site>(`/sites/${id}`, json("PATCH", body)),
  changePi: (id: number, body: { pi_name: string; valid_from?: string | null; step_id?: number | null }) =>
    apiFetch<Site>(`/sites/${id}/pi`, json("PUT", body)),
  remove: (id: number) => apiFetch<Site>(`/sites/${id}/remove`, { method: "POST" }),
  restore: (id: number) => apiFetch<Site>(`/sites/${id}/restore`, { method: "POST" }),
  facts: (id: number) => apiFetch<SiteFacts>(`/sites/${id}/facts`),
  addFact: (
    id: number,
    body: { name: string; value: string; valid_from?: string | null; step_id?: number | null; corrects?: number | null },
  ) => apiFetch<FactEntry>(`/sites/${id}/facts`, json("POST", body)),
};

/** "01 · PI 김○○", "PI 김○○", "01" or "" for an unnamed site. */
export function siteLabel(s: { site_no?: string; pi_name?: string } | null | undefined): string {
  if (!s) return "";
  return [s.site_no?.trim(), s.pi_name?.trim() ? `PI ${s.pi_name.trim()}` : ""].filter(Boolean).join(" · ");
}
