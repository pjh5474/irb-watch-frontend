import type { IrbSession, SessionKind } from "@/lib/api/calendar";
import { apiFetch } from "@/lib/api/client";
import type { Draft, DraftJob, UploadFile } from "@/lib/api/docgen";
import type { ProjectAccess } from "@/lib/api/projects";

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
  site_id?: number | null; // phase B2a: the site (hospital + PI) of this pipeline
  pi_name?: string;
  site_no?: string;
};

export type DocVersion = {
  version_no: number;
  filename: string;
  size_bytes: number;
  has_text: boolean;
  text_note: string | null;
  created_at: string;
};

/** Where a document sits in a step (phase C1): 신청서 및 통지서 = application + received. */
export type DocSection = "application" | "submission" | "received" | "reference";
/** needed: nothing yet; in_progress: a file arrived; final: marked by a user; not_needed: counts as done. */
export type DocStatus = "needed" | "in_progress" | "final" | "not_needed";
/** The page's order of sections. */
export const DOC_SECTIONS: DocSection[] = ["application", "received", "submission", "reference"];

/** A document slot of a step (phase C1). listed: from the step type's list (name and section stay). */
export type StepDocument = {
  id: number;
  name: string;
  created_at: string;
  deleted_at: string | null;
  versions: DocVersion[]; // newest first
  listed?: boolean;
  section?: DocSection;
  origin?: string;
  required?: boolean;
  status?: DocStatus;
  note?: string;
};

export type ChecklistItem = { name: string; done: boolean; status: DocStatus; document_id: number | null };

export type DocumentChange = Partial<{ name: string; section: DocSection; note: string; status: DocStatus }>;

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
  // phase B2b
  parent_step_id?: number | null; // a follow-up: the main step it answers
  sequence_no?: number | null; // "2" in 2차 변경심의
  label?: string; // the name as shown: "2차 변경심의"
  subject?: string; // what the step is about: "PT 2.0, CRF 1.1"
  result_key?: string | null; // the IRB's answer; null: none yet
  target_session_id?: number | null; // CAL-1: the IRB meeting it aims for
  copied_from_step_id?: number | null; // phase C2: copied from a sibling site's step
};

/** The step a copied step came from (phase C2). removed: that step or its pipeline is removed. */
export type StepOrigin = {
  pipeline_id: number;
  step_id: number;
  step_label: string;
  site_label: string; // "" for an unnamed site
  removed: boolean;
};

export type CopyReason =
  | "no_pipeline"
  | "already_copied"
  | "has_work"
  | "copied_from_other"
  | "too_many_steps"
  | "too_many_documents";

/**
 * One sibling site in "Copy to other PIs" (phase C2): add a new step, fill the site's untouched
 * step of the same type, or skip with a reason. After a copy, step_id is the step at that site.
 */
export type CopyTarget = {
  site_id: number;
  site_no: string;
  pi_name: string;
  pipeline_id: number | null;
  action: "add" | "fill" | "skip";
  reason: CopyReason | null;
  step_id: number | null;
  step_label: string;
  notes: "meeting_not_copied"[];
};

/** The IRB's answer to a step (admin-edited list). needs_answer: offer a follow-up step. */
export type StepResult = { key: string; label: string; approved: boolean; needs_answer: boolean; archived: boolean };

export type StepTypeRef = { id: number; name: string; description: string; category?: string; numbered?: boolean };

/** "2차 변경심의": the server's label, or the name for an older server. */
export const stepLabel = (s: Pick<PipelineStep, "name" | "label">) => s.label || s.name;

/** A step row of the overview: counts only; the documents are on the step page. */
export type OverviewStep = PipelineStep & {
  documents: number; // live documents with at least one file
  required: number; // required document slots (phase C1)
  required_missing: number; // required slots not final and not marked not needed
  drafts: number; // the user's drafts made in this step
  open_jobs: number; // draft jobs queued or running for this step
};

export type PipelineStatus = { key: string; label: string; closed: boolean; archived: boolean };

/** The pipeline overview (one row per step). */
export type PipelineDetail = {
  pipeline: PipelineSummary;
  steps: OverviewStep[];
  statuses: PipelineStatus[];
  step_types: StepTypeRef[];
  access: ProjectAccess; // read = change nothing (a platform admin's support access)
  results?: StepResult[]; // archived ones too, for labels
};

/**
 * The step page in one call. A removed step, or a step of a removed pipeline, still comes
 * back (the page shows it read-only); previous / next skip removed steps.
 */
export type StepPage = {
  pipeline: PipelineSummary;
  step: PipelineStep;
  documents: StepDocument[];
  checklist: ChecklistItem[];
  drafts: Draft[];
  jobs: DraftJob[]; // open, and failed in the last 24 hours
  previous_step_id: number | null;
  next_step_id: number | null;
  statuses: PipelineStatus[];
  access: ProjectAccess;
  shared: boolean; // the project has members: a draft made here is read by all of them
  // phase B2b
  results?: StepResult[];
  parent?: PipelineStep | null; // the main step a follow-up answers
  follow_ups?: PipelineStep[];
  follow_up_types?: StepTypeRef[]; // live follow-up types, for "Add follow-up step"
  suggested_status?: string | null; // offered after a result; the user confirms
  needs_answer?: boolean; // the result asks for an answer: highlight "Add follow-up step"
  // CAL-1
  target_session?: IrbSession | null; // the meeting the step aims for
  sessions?: IrbSession[]; // the hospital's upcoming sessions (proposals included, marked)
  suggested_session_id?: number | null; // the hint; nothing is saved until the user picks
  target_warning?: "cancelled" | "rejected" | "removed" | "unavailable" | null;
  session_kinds?: SessionKind[];
  copied_from?: StepOrigin | null; // phase C2
};

/** One site's column on the hospital page: its live main steps. */
export type HospitalStep = {
  id: number;
  step_type_id: number | null;
  name: string;
  label: string;
  sequence_no: number | null;
  subject: string;
  status_key: string;
  result_key: string | null;
  due_on: string | null;
  submitted_on: string | null;
  decided_on: string | null;
  follow_ups: number;
};

export type HospitalPage = {
  project_id: number;
  hospital_id: number;
  hospital_name: string | null;
  sites: { site_id: number; site_no: string; pi_name: string; pipeline_id: number | null; steps: HospitalStep[] }[];
  statuses: PipelineStatus[];
  results: StepResult[];
  step_types: StepTypeRef[];
  access: ProjectAccess;
};

export type PipelineEvent = {
  id: number;
  step_id: number | null;
  mine: boolean;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null; // who did it, when it was someone else
};

export type StepChange = Partial<{
  name: string;
  status_key: string;
  due_on: string | null;
  submitted_on: string | null;
  decided_on: string | null;
  note: string;
  subject: string;
  sequence_no: number | null;
  result_key: string | null;
  target_session_id: number | null;
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
  site_details?: string[]; // names of the site's details that go to the AI service (D18)
};

export const MAX_PIPELINE_FILE = 20_000_000;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const step = (pid: number, sid: number) => `/pipelines/${pid}/steps/${sid}`;

export const pipelineApi = {
  list: (projectId: number, includeRemoved = false) =>
    apiFetch<PipelineSummary[]>(`/projects/${projectId}/pipelines${includeRemoved ? "?include_removed=true" : ""}`),
  /** A site's pipeline, or (hospital alone) the hospital's unnamed site, made when it has no site. */
  start: (projectId: number, target: { hospital_id?: number; site_id?: number }) =>
    apiFetch<{ id: number }>(`/projects/${projectId}/pipelines`, json("POST", target)),
  get: (id: number) => apiFetch<PipelineDetail>(`/pipelines/${id}`),
  remove: (id: number) => apiFetch<unknown>(`/pipelines/${id}`, { method: "DELETE" }),
  restore: (id: number) => apiFetch<unknown>(`/pipelines/${id}/restore`, { method: "POST" }),
  history: (id: number, stepId?: number) =>
    apiFetch<PipelineEvent[]>(`/pipelines/${id}/history${stepId === undefined ? "" : `?step_id=${stepId}`}`),
  getStep: (id: number, stepId: number) => apiFetch<StepPage>(step(id, stepId)),

  addStep: (
    id: number,
    body: { name?: string | null; step_type_id?: number | null; parent_step_id?: number | null; subject?: string },
  ) => apiFetch<PipelineStep>(`/pipelines/${id}/steps`, json("POST", body)),
  hospital: (projectId: number, hospitalId: number) =>
    apiFetch<HospitalPage>(`/projects/${projectId}/hospitals/${hospitalId}`),
  updateStep: (id: number, stepId: number, change: StepChange) =>
    apiFetch<PipelineStep>(step(id, stepId), json("PATCH", change)),
  reorder: (id: number, stepIds: number[]) =>
    apiFetch<PipelineStep[]>(`/pipelines/${id}/steps/order`, json("PUT", { step_ids: stepIds })),
  removeStep: (id: number, stepId: number) => apiFetch<PipelineStep>(step(id, stepId), { method: "DELETE" }),
  restoreStep: (id: number, stepId: number) =>
    apiFetch<PipelineStep>(`${step(id, stepId)}/restore`, { method: "POST" }),

  draftInputs: (id: number, stepId: number) => apiFetch<DraftInputs>(`${step(id, stepId)}/draft-inputs`),

  /** What copying a main step to the other PIs of its hospital would do (nothing is written). */
  copyTargets: (id: number, stepId: number) => apiFetch<CopyTarget[]>(`${step(id, stepId)}/copy-targets`),
  /** All or nothing; 409 with the reasons when every chosen site is skipped. */
  copyStep: (id: number, stepId: number, siteIds: number[]) =>
    apiFetch<CopyTarget[]>(`${step(id, stepId)}/copy`, json("POST", { site_ids: siteIds })),

  /** Into a slot (documentId), or by name: that slot, else a new one of the user's in `section`. */
  upload: (id: number, stepId: number, name: string, file: UploadFile, documentId?: number, section?: DocSection) =>
    apiFetch<{ document: StepDocument; version_no: number }>(
      `${step(id, stepId)}/documents`,
      json("POST", { name, file, document_id: documentId ?? null, section: section ?? null }),
    ),
  addDocument: (id: number, stepId: number, name: string, section: DocSection) =>
    apiFetch<StepDocument>(`${step(id, stepId)}/document-slots`, json("POST", { name, section })),
  updateDocument: (id: number, stepId: number, documentId: number, change: DocumentChange) =>
    apiFetch<StepDocument>(`${step(id, stepId)}/documents/${documentId}`, json("PATCH", change)),
  reorderDocuments: (id: number, stepId: number, documentIds: number[]) =>
    apiFetch<StepDocument[]>(`${step(id, stepId)}/documents/order`, json("PUT", { document_ids: documentIds })),
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
