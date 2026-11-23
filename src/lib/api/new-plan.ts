import { apiFetch } from "@/lib/api/client";

// The R-BAY 신규계획 draft of a pipeline step (server: /pipelines/steps/{id}/new-plan/...). The form
// comes from the server as data (types, fields, show-when rules), so a hospital's form change needs
// no change here. Only the pipeline owner may use it; others get a 404 "step not found".

export type FieldKind = "text" | "textarea" | "date" | "select" | "radio" | "multi" | "file" | "lookup" | "docs";
export type ShowRule = { key: string; is?: string; includes?: string; is_one_of?: string[] };

export type PlanField = {
  key: string;
  kind: FieldKind;
  label: string; // R-BAY's own label (Korean)
  basis: "star" | "assumed" | "optional";
  required: boolean; // only while the field is shown
  options: string[]; // option keys
  option_labels: Record<string, string> | null; // R-BAY's own option texts (Part I); null: show the keys
  note: string;
  show_when: ShowRule[];
  types: string[] | null; // project types the field exists in; null = all
  multiple: boolean;
  max_length: number | null;
  numeric: boolean;
  dynamic_options: boolean; // a select whose list R-BAY loads (typed here as its code)
  supported: boolean; // false: a file or 제출서류 field, not written by the job yet
  code_prefix_of: string | null;
  code_prefixes: Record<string, string> | null; // parent option key -> the code prefix, e.g. cancer -> DCLA
};

export type PlanForm = {
  available: boolean; // false: the hospital's R-BAY form has not been mapped
  types: Record<string, string>; // project type key -> R-BAY label
  pages: Array<{ form: string; fields: PlanField[] }>;
};

export type PlanValues = Record<string, unknown>;

export type PlanRecord = {
  id: string;
  version: number;
  project_key: string;
  affiliation: string;
  values: PlanValues;
  source: string;
  created_at: string;
};

export type PlanRunStatus = "queued" | "running" | "done" | "failed";
export type PlanRun = {
  id: string;
  pipeline_step_id: number;
  record_version: number;
  status: PlanRunStatus;
  stage: "not_opened" | "form_opened" | "part1_saved" | "part2_saved";
  error: string | null;
  draft_title: string | null;
  draft_may_exist: boolean;
  report: { fields?: Array<{ key: string; status: string; detail: string }>; dialogs?: string[] };
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const RUN_POLL_MS = 3_000;
export const isOpenRun = (r: PlanRun) => r.status === "queued" || r.status === "running";

const base = (stepId: number) => `/pipelines/steps/${stepId}/new-plan`;

export const newPlanApi = {
  form: (stepId: number) => apiFetch<PlanForm>(`${base(stepId)}/form`),
  values: (stepId: number) => apiFetch<PlanRecord | null>(`${base(stepId)}/values`),
  save: (stepId: number, body: { project_key: string; affiliation: string; values: PlanValues }) =>
    apiFetch<PlanRecord>(`${base(stepId)}/values`, { method: "PUT", body: JSON.stringify(body) }),
  check: (stepId: number) => apiFetch<{ ready: boolean; problems: string[] }>(`${base(stepId)}/check`),
  start: (stepId: number) => apiFetch<PlanRun>(`${base(stepId)}/runs`, { method: "POST" }),
  runs: (stepId: number, history = false) =>
    apiFetch<PlanRun[]>(`${base(stepId)}/runs${history ? "?history=true" : ""}`),
  // The server cannot see R-BAY: it needs the user's statement that the draft is gone.
  release: (stepId: number) =>
    apiFetch<{ released: number }>(`${base(stepId)}/release`, { method: "POST", body: JSON.stringify({ confirm: true }) }),
};

// -- the form's own rules, as the server applies them (crawlers/rbay_forms/model.py `is_shown`) ------

/** A stored value is plain, or {value, source, ...} when the document agent wrote it. */
export function unwrapValues(raw: PlanValues): PlanValues {
  const out: PlanValues = {};
  for (const [key, item] of Object.entries(raw)) {
    out[key] =
      item !== null && typeof item === "object" && !Array.isArray(item) && "value" in item
        ? (item as { value: unknown }).value
        : item;
  }
  return out;
}

export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function isShown(field: PlanField, fields: PlanField[], values: PlanValues, projectKey: string): boolean {
  if (field.types !== null && !field.types.includes(projectKey)) return false;
  for (const rule of field.show_when) {
    const controller = fields.find((f) => f.key === rule.key);
    if (!controller || !isShown(controller, fields, values, projectKey)) return false;
    const raw = values[rule.key];
    const current = typeof raw === "string" ? raw.trim() : raw;
    if (rule.is !== undefined && current !== rule.is) return false;
    if (rule.includes !== undefined && !(Array.isArray(current) && current.includes(rule.includes))) return false;
    if (rule.is_one_of !== undefined && !rule.is_one_of.includes(current as string)) return false;
  }
  return true;
}

/**
 * The values to save: only what is shown now, filled in, and written by the job. The server refuses
 * a value set on a hidden field, so a choice that was changed back must not leave its answers behind.
 */
export function valuesToSave(form: PlanForm, values: PlanValues, projectKey: string): PlanValues {
  const out: PlanValues = {};
  for (const page of form.pages) {
    for (const field of page.fields) {
      if (!field.supported) continue;
      const value = values[field.key];
      if (!isPresent(value) || !isShown(field, page.fields, values, projectKey)) continue;
      out[field.key] = typeof value === "string" ? value.trim() : value;
    }
  }
  return out;
}

/** The code prefix a dynamic select must start with, from its parent's current choice (e.g. DCLA). */
export function codePrefix(field: PlanField, values: PlanValues): string | null {
  if (!field.code_prefix_of || !field.code_prefixes) return null;
  const parent = values[field.code_prefix_of];
  return typeof parent === "string" ? (field.code_prefixes[parent] ?? null) : null;
}
