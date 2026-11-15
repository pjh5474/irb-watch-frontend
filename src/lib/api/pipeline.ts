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
  archived_at: string | null;
  updated_at: string;
  category: StepCategory; // phase B2b
  numbered: boolean; // shows "{n}차"
};

export const CATEGORIES = [
  "initial", "amendment", "continuing", "deviation", "safety", "report", "closing", "follow_up", "other",
] as const;
export type StepCategory = (typeof CATEGORIES)[number];

export type StepTypeInput = Omit<StepType, "id" | "archived_at" | "updated_at">;

/** The IRB's answer (phase B2b). approved: counts as approved; needs_answer: offer a follow-up. */
export type StepResultRow = {
  key: string;
  label: string;
  approved: boolean;
  needs_answer: boolean;
  position: number;
  archived_at: string | null;
};

export type PipelineTemplate = { hospital_id: number | null; step_type_ids: number[]; updated_at: string };

/** Phase C1: one row of a step type's document list. A new step copies it as a slot. */
export type DocSectionKey = "application" | "submission" | "received" | "reference";
export const DOC_SECTION_KEYS: DocSectionKey[] = ["application", "received", "submission", "reference"];
export const DOC_ORIGINS = ["draft", "upload", "library", "received"] as const;
export type DocOrigin = (typeof DOC_ORIGINS)[number];
/** Sections whose documents never count as required (the server clears the flag). */
export const NEVER_REQUIRED: DocSectionKey[] = ["received", "reference"];
export const MAX_DOCUMENT_KINDS = 50;

export type DocumentKind = { id: number; name: string; section: DocSectionKey; origin: DocOrigin; required: boolean };
/** id: a row of the same list to keep; null adds one. */
export type DocumentKindInput = Omit<DocumentKind, "id"> & { id: number | null };
/** A step type's lists: the global one and each hospital that has its own (an empty one = none). */
export type DocumentLists = {
  step_type_id: number;
  global_documents: DocumentKind[];
  hospitals: { hospital_id: number; documents: DocumentKind[] }[];
};

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

  results: (includeArchived = false) =>
    apiFetch<StepResultRow[]>(`${base}/results${includeArchived ? "?include_archived=true" : ""}`),
  addResult: (body: { label: string; approved: boolean; needs_answer: boolean }) =>
    apiFetch<StepResultRow>(`${base}/results`, json("POST", body)),
  updateResult: (key: string, body: { label?: string; approved?: boolean; needs_answer?: boolean }) =>
    apiFetch<StepResultRow>(`${base}/results/${key}`, json("PATCH", body)),
  reorderResults: (keys: string[]) => apiFetch<StepResultRow[]>(`${base}/results/order`, json("PUT", { keys })),
  archiveResult: (key: string) => apiFetch<StepResultRow>(`${base}/results/${key}/archive`, { method: "POST" }),
  restoreResult: (key: string) => apiFetch<StepResultRow>(`${base}/results/${key}/restore`, { method: "POST" }),

  stepTypes: (includeArchived = false) =>
    apiFetch<StepType[]>(`${base}/step-types${includeArchived ? "?include_archived=true" : ""}`),
  createStepType: (body: StepTypeInput) => apiFetch<StepType>(`${base}/step-types`, json("POST", body)),
  updateStepType: (id: number, body: StepTypeInput) => apiFetch<StepType>(`${base}/step-types/${id}`, json("PUT", body)),
  archiveStepType: (id: number) => apiFetch<StepType>(`${base}/step-types/${id}/archive`, { method: "POST" }),
  restoreStepType: (id: number) => apiFetch<StepType>(`${base}/step-types/${id}/restore`, { method: "POST" }),

  templates: () => apiFetch<PipelineTemplate[]>(`${base}/templates`),
  saveTemplate: (hospitalId: number | null, stepTypeIds: number[]) =>
    apiFetch<PipelineTemplate>(
      hospitalId === null ? `${base}/templates/global` : `${base}/templates/hospitals/${hospitalId}`,
      json("PUT", { step_type_ids: stepTypeIds }),
    ),
  deleteTemplate: (hospitalId: number) =>
    apiFetch<void>(`${base}/templates/hospitals/${hospitalId}`, { method: "DELETE" }),

  documentLists: (typeId: number) => apiFetch<DocumentLists>(`${base}/step-types/${typeId}/documents`),
  /** Saves one list whole (rows in order); for a hospital without a list this makes its own. */
  saveDocuments: (typeId: number, hospitalId: number | null, rows: DocumentKindInput[]) =>
    apiFetch<DocumentLists>(
      hospitalId === null
        ? `${base}/step-types/${typeId}/documents/global`
        : `${base}/step-types/${typeId}/documents/hospitals/${hospitalId}`,
      json("PUT", { documents: rows }),
    ),
  /** The hospital goes back to the global list for this step type. */
  deleteHospitalDocuments: (typeId: number, hospitalId: number) =>
    apiFetch<DocumentLists>(`${base}/step-types/${typeId}/documents/hospitals/${hospitalId}`, { method: "DELETE" }),
};

/** Moves the item at `index` one place up (-1) or down (+1); returns a new array. */
export function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

/** The first repeated name of a document list (ignoring case and spacing), or null. */
export function repeatedName(rows: { name: string }[]): string | null {
  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.name.trim().replace(/\s+/g, " ").toLowerCase();
    if (key && seen.has(key)) return r.name.trim();
    seen.add(key);
  }
  return null;
}
