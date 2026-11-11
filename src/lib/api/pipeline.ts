import { apiFetch } from "@/lib/api/client";

// IRB pipeline setup (platform admins only): step statuses, step types with their AI settings,
// and the default step order (global and per hospital). Server-wide settings.

export type StepStatus = { key: string; label: string; closed: boolean; position: number; archived_at: string | null };

export type StepType = {
  id: number;
  name: string;
  description: string;
  instructions: string;
  guide_ids: number[];
  form_template_id: number | null;
  input_earlier_steps: boolean;
  input_board_documents: boolean;
  required_documents: string[];
  archived_at: string | null;
  updated_at: string;
};

export type StepTypeInput = Omit<StepType, "id" | "archived_at" | "updated_at">;

export type PipelineTemplate = { source_id: number | null; step_type_ids: number[]; updated_at: string };

export const MAX_INSTRUCTIONS = 4000;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const base = "/admin/pipeline";

export const pipelineAdminApi = {
  statuses: (includeArchived = false) =>
    apiFetch<StepStatus[]>(`${base}/statuses${includeArchived ? "?include_archived=true" : ""}`),
  addStatus: (label: string, closed: boolean) => apiFetch<StepStatus>(`${base}/statuses`, json("POST", { label, closed })),
  updateStatus: (key: string, body: { label?: string; closed?: boolean }) =>
    apiFetch<StepStatus>(`${base}/statuses/${key}`, json("PATCH", body)),
  reorderStatuses: (keys: string[]) => apiFetch<StepStatus[]>(`${base}/statuses/order`, json("PUT", { keys })),
  archiveStatus: (key: string) => apiFetch<StepStatus>(`${base}/statuses/${key}/archive`, { method: "POST" }),
  restoreStatus: (key: string) => apiFetch<StepStatus>(`${base}/statuses/${key}/restore`, { method: "POST" }),

  stepTypes: (includeArchived = false) =>
    apiFetch<StepType[]>(`${base}/step-types${includeArchived ? "?include_archived=true" : ""}`),
  createStepType: (body: StepTypeInput) => apiFetch<StepType>(`${base}/step-types`, json("POST", body)),
  updateStepType: (id: number, body: StepTypeInput) => apiFetch<StepType>(`${base}/step-types/${id}`, json("PUT", body)),
  archiveStepType: (id: number) => apiFetch<StepType>(`${base}/step-types/${id}/archive`, { method: "POST" }),
  restoreStepType: (id: number) => apiFetch<StepType>(`${base}/step-types/${id}/restore`, { method: "POST" }),

  templates: () => apiFetch<PipelineTemplate[]>(`${base}/templates`),
  saveTemplate: (sourceId: number | null, stepTypeIds: number[]) =>
    apiFetch<PipelineTemplate>(
      sourceId === null ? `${base}/templates/global` : `${base}/templates/sources/${sourceId}`,
      json("PUT", { step_type_ids: stepTypeIds }),
    ),
  deleteTemplate: (sourceId: number) => apiFetch<void>(`${base}/templates/sources/${sourceId}`, { method: "DELETE" }),
};

/** Moves the item at `index` one place up (-1) or down (+1); returns a new array. */
export function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

/** One required document per line, trimmed, blanks and repeats (ignoring case) dropped. */
export function requiredDocsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const name = line.trim().replace(/\s+/g, " ");
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}
