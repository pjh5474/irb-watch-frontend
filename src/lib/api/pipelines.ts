import { apiFetch } from "@/lib/api/client";
import type { UploadFile } from "@/lib/api/docgen";

// A user's IRB pipelines (owner only): one per project and hospital, with steps, documents
// (versioned by name) and a history. Served by the backend; the browser never reads the tables.

export type PipelineSummary = {
  id: number;
  project_id: number;
  hospital_id: number;
  hospital_name: string | null; // hospitals are readable by every user; null should not happen
  in_project: boolean;
  steps: number;
  closed_steps: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DocVersion = {
  version_no: number;
  filename: string;
  size_bytes: number;
  has_text: boolean;
  text_note: string | null;
  created_at: string;
};

export type StepDocument = { id: number; name: string; created_at: string; deleted_at: string | null; versions: DocVersion[] };

export type PipelineStep = {
  id: number;
  step_type_id: number | null;
  step_type_name: string | null;
  name: string;
  position: number;
  status_key: string;
  due_on: string | null;
  submitted_on: string | null;
  decided_on: string | null;
  note: string;
  deleted_at: string | null;
  documents: StepDocument[];
  checklist: { name: string; uploaded: boolean }[];
};

export type PipelineStatus = { key: string; label: string; closed: boolean; archived: boolean };

export type PipelineDetail = {
  pipeline: PipelineSummary;
  steps: PipelineStep[];
  statuses: PipelineStatus[];
  step_types: { id: number; name: string; description: string }[];
};

export type PipelineEvent = {
  id: number;
  step_id: number | null;
  mine: boolean;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type StepChange = Partial<{
  name: string;
  status_key: string;
  due_on: string | null;
  submitted_on: string | null;
  decided_on: string | null;
  note: string;
}>;

/** One of the user's own files offered for an AI draft of a step (its newest version). */
export type DraftFileChoice = {
  document_id: number;
  name: string;
  step_id: number;
  step_name: string;
  version_no: number;
  filename: string;
  has_text: boolean; // false: stored only, cannot be sent to the AI
  text_note: string | null;
  ticked: boolean;
};

/** What the "Draft for this step" dialog starts from. Nothing here has been sent anywhere. */
export type DraftInputs = {
  step_id: number;
  step_name: string;
  hospital_id: number;
  files: DraftFileChoice[];
  allow_board_documents: boolean;
  guide_ids: number[];
  form_template_id: number | null;
  has_instructions: boolean;
};

export const MAX_PIPELINE_FILE = 20_000_000;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const step = (pid: number, sid: number) => `/pipelines/${pid}/steps/${sid}`;

export const pipelineApi = {
  list: (projectId: number, includeRemoved = false) =>
    apiFetch<PipelineSummary[]>(`/projects/${projectId}/pipelines${includeRemoved ? "?include_removed=true" : ""}`),
  start: (projectId: number, hospitalId: number) =>
    apiFetch<{ id: number }>(`/projects/${projectId}/pipelines`, json("POST", { hospital_id: hospitalId })),
  get: (id: number) => apiFetch<PipelineDetail>(`/pipelines/${id}`),
  remove: (id: number) => apiFetch<unknown>(`/pipelines/${id}`, { method: "DELETE" }),
  restore: (id: number) => apiFetch<unknown>(`/pipelines/${id}/restore`, { method: "POST" }),
  history: (id: number) => apiFetch<PipelineEvent[]>(`/pipelines/${id}/history`),

  addStep: (id: number, body: { name?: string | null; step_type_id?: number | null }) =>
    apiFetch<PipelineStep>(`/pipelines/${id}/steps`, json("POST", body)),
  updateStep: (id: number, stepId: number, change: StepChange) =>
    apiFetch<PipelineStep>(step(id, stepId), json("PATCH", change)),
  reorder: (id: number, stepIds: number[]) =>
    apiFetch<PipelineStep[]>(`/pipelines/${id}/steps/order`, json("PUT", { step_ids: stepIds })),
  removeStep: (id: number, stepId: number) => apiFetch<PipelineStep>(step(id, stepId), { method: "DELETE" }),
  restoreStep: (id: number, stepId: number) =>
    apiFetch<PipelineStep>(`${step(id, stepId)}/restore`, { method: "POST" }),

  draftInputs: (id: number, stepId: number) => apiFetch<DraftInputs>(`${step(id, stepId)}/draft-inputs`),

  upload: (id: number, stepId: number, name: string, file: UploadFile) =>
    apiFetch<{ document: StepDocument; version_no: number }>(`${step(id, stepId)}/documents`, json("POST", { name, file })),
  setDocumentRemoved: (id: number, stepId: number, documentId: number, removed: boolean) =>
    apiFetch<StepDocument>(`${step(id, stepId)}/documents/${documentId}/${removed ? "remove" : "restore"}`, {
      method: "POST",
    }),
  downloadUrl: (id: number, stepId: number, documentId: number, versionNo: number) =>
    apiFetch<{ url: string }>(`${step(id, stepId)}/documents/${documentId}/versions/${versionNo}/download-url`, {
      method: "POST",
    }),
};

/** A short size label: 512 B, 12 KB, 3.4 MB. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Days from `today` to `due` (both YYYY-MM-DD); negative = overdue. */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Today in Seoul as YYYY-MM-DD (the server fills dates in the same time zone). */
export function todaySeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
