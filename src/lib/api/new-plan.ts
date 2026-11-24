import { apiFetch } from "@/lib/api/client";

// The R-BAY 신규계획 draft of a pipeline step (server: /pipelines/steps/{id}/new-plan/...). The form
// comes from the server as data (types, fields, show-when rules), so a hospital's form change needs
// no change here. Only the pipeline owner may use it; others get a 404 "step not found".

export type FieldKind = "text" | "textarea" | "date" | "select" | "radio" | "multi" | "file" | "lookup" | "docs" | "rows";

/** One box of a row (the 의약품 / 의료기기 pop-ups): text or a radio group. */
export type RowBox = {
  key: string;
  kind: "text" | "radio";
  label: string;
  required: boolean;
  options: string[];
  option_labels: Record<string, string> | null;
};
export type PlanRow = Record<string, string>;
export type ShowRule = {
  key: string;
  is?: string;
  includes?: string;
  excludes?: string; // shown unless this box is ticked (PHASE PMS disables 연구 목적)
  is_one_of?: string[];
  is_empty?: boolean;
};

export type PlanField = {
  key: string;
  kind: FieldKind;
  label: string; // R-BAY's own label (Korean)
  basis: "star" | "assumed" | "optional";
  required: boolean; // only while the field is shown
  required_types?: string[] | null; // project types where it really has to be answered; null: every type
  options: string[]; // option keys
  option_labels: Record<string, string> | null; // R-BAY's own option texts (Part I); null: show the keys
  note: string;
  show_when: ShowRule[];
  types: string[] | null; // project types the field exists in; null = all
  multiple: boolean;
  max_length: number | null;
  numeric: boolean;
  dynamic_options: boolean; // a select whose list R-BAY loads (typed here as its code)
  supported: boolean; // false: a file field the job does not write yet (the main attachments and their entries work)
  max_files: number | null;
  code_prefix_of: string | null;
  code_prefixes: Record<string, string> | null; // parent option key -> the code prefix, e.g. cancer -> DCLA
  // The lists R-BAY loads for a dependent select, where they were read: parent option key -> {code: text}.
  dependent_options: Record<string, Record<string, string>> | null;
  option_needs: Record<string, string>; // multi: child option -> the parent option that must be ticked
  exclusive_groups: string[][]; // multi: ticking one group makes the options of the other groups unusable
  rows?: { max_rows: number; fields: RowBox[] } | null; // kind "rows": the boxes of one row
};

/** A rows value as the editor holds it: a list of rows, each box as text. */
export function planRows(value: unknown): PlanRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const row: PlanRow = {};
    for (const [k, x] of Object.entries((v ?? {}) as Record<string, unknown>)) row[k] = String(x ?? "");
    return row;
  });
}

export type PlanForm = {
  available: boolean; // false: the hospital's R-BAY form has not been mapped
  types: Record<string, string>; // project type key -> R-BAY label
  // `sections`: R-BAY's headings in order with the field keys under each (absent or empty: no headings)
  pages: Array<{ form: string; fields: PlanField[]; sections?: Array<{ title: string; keys: string[] }> }>;
};

export type PlanValues = Record<string, unknown>;

/** A stored version of a file of the step; a record names it by `version_id` (as text). */
export type PlanFile = {
  version_id: number;
  document_id: number;
  document_name: string;
  version_no: number;
  filename: string;
  size_bytes: number;
  created_at: string;
};

/** One line of R-BAY's 제출서류 list (name from the hospital's list or free text; version and date as typed). */
export type DocEntry = { name: string; version: string; date: string };

export function docEntries(value: unknown): DocEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const e = (v ?? {}) as Record<string, unknown>;
    return { name: String(e.name ?? ""), version: String(e.version ?? ""), date: String(e.date ?? "") };
  });
}

/** The entry a picked file starts with: its name without the extension. Nothing else is guessed. */
export function entryFromFile(file: PlanFile): DocEntry {
  return { name: file.filename.replace(/\.[^./\\]{1,8}$/, ""), version: "", date: "" };
}

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
  files: (stepId: number) => apiFetch<PlanFile[]>(`${base(stepId)}/files`),
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
    if (rule.excludes !== undefined && Array.isArray(current) && current.includes(rule.excludes)) return false;
    if (rule.is_one_of !== undefined && !rule.is_one_of.includes(current as string)) return false;
    if (rule.is_empty !== undefined && isPresent(current) === rule.is_empty) return false;
  }
  return true;
}

/** The options of a multi field that cannot be ticked now: a child whose parent is not ticked, and the
 *  options of every group other than the one already in use (R-BAY disables them the same way). */
export function blockedOptions(field: PlanField, ticked: string[]): Set<string> {
  const blocked = new Set<string>();
  for (const [child, parent] of Object.entries(field.option_needs)) if (!ticked.includes(parent)) blocked.add(child);
  const inUse = field.exclusive_groups.filter((g) => g.some((o) => ticked.includes(o)));
  if (inUse.length > 0)
    for (const group of field.exclusive_groups) if (!inUse.includes(group)) group.forEach((o) => blocked.add(o));
  return blocked;
}

/** A multi value as R-BAY would leave it: no child without its parent, one exclusive group only. */
export function cleanMulti(field: PlanField, ticked: string[]): string[] {
  let out = ticked.filter((o) => field.options.includes(o));
  for (let pass = 0; pass < 2; pass++) out = out.filter((o) => !(o in field.option_needs) || out.includes(field.option_needs[o]));
  const groups = field.exclusive_groups.filter((g) => g.some((o) => out.includes(o)));
  if (groups.length > 1) out = out.filter((o) => groups[0].includes(o) || !field.exclusive_groups.some((g) => g.includes(o)));
  return out;
}

/** The R-BAY list of a dependent select for the parent's current choice, or null when it was not read. */
export function dependentList(field: PlanField, values: PlanValues): Record<string, string> | null {
  if (!field.code_prefix_of || !field.dependent_options) return null;
  const parent = values[field.code_prefix_of];
  return typeof parent === "string" ? (field.dependent_options[parent] ?? null) : null;
}

/** The values with every answer of a hidden field removed (R-BAY clears them), and dependent answers that
 *  no longer fit their parent. Run after each change so the screen and the saved record agree. */
export function pruneValues(form: PlanForm, values: PlanValues, projectKey: string): PlanValues {
  const out: PlanValues = { ...values };
  for (const page of form.pages) {
    for (const field of page.fields) {
      if (!(field.key in out)) continue;
      if (!isShown(field, page.fields, out, projectKey)) {
        delete out[field.key];
        continue;
      }
      const value = out[field.key];
      if (field.kind === "multi" && Array.isArray(value)) out[field.key] = cleanMulti(field, value as string[]);
      // A dependent select: the answer must belong to the chosen parent (its code prefix, and its list
      // when that was read); a changed parent drops it.
      const list = dependentList(field, out);
      const prefix = codePrefix(field, out);
      if (typeof value === "string" && value !== "") {
        if ((list !== null && !(value in list)) || (prefix !== null && !value.startsWith(prefix))) delete out[field.key];
      }
    }
  }
  return out;
}

/**
 * The values to save: only what is shown now, filled in, and written by the job. The server refuses
 * a value set on a hidden field, so a choice that was changed back must not leave its answers behind.
 */
export function valuesToSave(form: PlanForm, raw: PlanValues, projectKey: string): PlanValues {
  const out: PlanValues = {};
  const values = pruneValues(form, raw, projectKey);
  for (const page of form.pages) {
    for (const field of page.fields) {
      if (!field.supported) continue;
      const value = values[field.key];
      if (!isPresent(value) || !isShown(field, page.fields, values, projectKey)) continue;
      if (field.kind === "docs") {
        // a row with no name is an empty row; the rest are trimmed
        const rows = docEntries(value)
          .map((e) => ({ name: e.name.trim(), version: e.version.trim(), date: e.date.trim() }))
          .filter((e) => e.name !== "");
        if (rows.length > 0) out[field.key] = rows;
        continue;
      }
      if (field.kind === "rows" && field.rows) {
        // trimmed boxes only; a row with no name is an empty row and is left out; never more than the cap
        const rows = planRows(value)
          .map((r) => Object.fromEntries(field.rows!.fields.map((b) => [b.key, (r[b.key] ?? "").trim()]).filter(([, x]) => x !== "")))
          .filter((r) => (r.name ?? "") !== "")
          .slice(0, field.rows.max_rows);
        if (rows.length > 0) out[field.key] = rows;
        continue;
      }
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
