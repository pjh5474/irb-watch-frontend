import { ApiError, apiFetch, apiFetchFile } from "@/lib/api/client";

// The docs generator's routes (backend `api/docgen.py` and `api/admin_guides.py`). Typed by
// hand like the other new routes; replace with the generated schemas after `gen:api-types`.

export type DocgenStatus = { enabled: boolean; used: number; limit: number; reason: string | null };

export type Guide = {
  id: number;
  title: string;
  filename: string;
  chars: number;
  hospital_ids: number[];
  created_at: string;
  archived_at: string | null;
  // A default of every draft for every hospital; hospital_ids are unused while true. Older servers
  // do not send these.
  is_global?: boolean;
  text_updated_at?: string | null;
};

export type GuideWithText = Guide & { body_text: string };

/** An earlier text of a guide, kept when an admin replaced its file. */
export type GuideRevision = {
  id: number;
  filename: string;
  body_text: string;
  chars: number;
  valid_from: string;
  replaced_by: string | null;
  replaced_at: string;
};

/** One post to draft from. files null = every attached file; compare_with null = the version
 * just before; compare false = no list of changes. */
export type DocChoice = {
  document_id: number;
  version_no: number | null;
  files: string[] | null;
  page_text: boolean;
  compare_with: number | null;
  compare: boolean;
};

// Drafts saved before file choice have only the first three keys.
export type DocRef = { document_id: number; version_no: number; source_id: number } & Partial<
  Omit<DocChoice, "document_id" | "version_no">
>;

/** What one AI version was written from (null for hand edits and older versions). */
export type VersionInputs = {
  documents: DocRef[];
  guide_ids: number[];
  extra_guides: string[];
  ai_override_source_ids: number[];
};

/** New documents and guides for a revision; they replace the draft's current ones. */
export type ReviseInputs = {
  documents: DocChoice[];
  guide_ids: number[] | null;
  keep_extra_guides: string[];
  extra_guides: UploadFile[];
};

/** One place of a form the AI fills. key: "m:<name>" a {{name}} marker, "a:<where>" a blank
 * the server found, "c:<where>" a tick-box group. */
export type FormField = {
  key: string;
  label: string;
  kind: "text" | "choice";
  source: "marker" | "auto";
  where: string;
  options: string[];
  multi: boolean;
  hint: string;
};

/** A field's answer: text, or the picked options of a tick-box group. */
export type FieldValue = string | string[];
export type Answers = Record<string, FieldValue>;

/** The form a draft fills, copied when the draft was made. template_id null = a one-off file. */
export type DraftTemplate = { template_id: number | null; title: string; filename: string; fields: FormField[] };

/** An admin's blank form in the library; only "ready" ones are offered. */
export type FormTemplate = {
  id: number;
  title: string;
  doc_type: string;
  filename: string;
  is_global: boolean;
  status: "review" | "ready";
  hospital_ids: number[];
  fields: FormField[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type FieldEdit = { key: string; label: string; hint: string; multi: boolean };

export type Draft = {
  id: string;
  title: string;
  instruction: string;
  documents: DocRef[];
  guide_ids: number[];
  extra_guides: string[];
  ai_override_source_ids: number[];
  created_at: string;
  updated_at: string;
  template?: DraftTemplate | null; // null = a Markdown draft (older servers send nothing)
  pipeline_step_id?: number | null; // made in this IRB pipeline step
  step_files?: StepFileRef[]; // the user's own step files it is written from
  author?: string | null; // a shared pipeline draft of another member: their name
};

/** One of the user's own pipeline step files a draft is written from. */
export type StepFileRef = { document_id: number; version_no: number; name: string; step_id: number; step_name: string };

/**
 * A background draft or revision job. Every AI draft runs as one: the request is checked and
 * counted at once, then the writing goes on even if the user leaves the page.
 * done: draft_id is the draft to open. failed: error is the reason, written for the user.
 */
export type DraftJob = {
  id: string;
  kind: "draft" | "revision";
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  draft_id: string | null;
  pipeline_step_id: number | null;
  created_at: string;
  finished_at: string | null;
  mine?: boolean; // false: started by another member of a shared project
  started_by?: string | null; // their name
};

export const isOpenJob = (job: Pick<DraftJob, "status">) => job.status === "queued" || job.status === "running";

/** A draft made in a pipeline step: the user's own files and, if the step allows, board documents. */
export type StepDraft = Omit<NewDraft, "documents"> & {
  documents: DocChoice[];
  step_files: { document_id: number; version_no?: number | null }[];
};

export type DraftVersion = {
  version_no: number;
  markdown: string;
  origin: "ai" | "user_edit" | "ai_revision";
  instruction: string;
  created_at: string;
  inputs?: VersionInputs | null;
  fields?: Answers | null; // template drafts: one answer per field key
};

export type DraftDetail = {
  draft: Draft;
  versions: DraftVersion[];
  guides: Guide[];
  pipeline_id?: number | null; // the pipeline of the draft's step ("Back to step"); null: standalone
  can_edit?: boolean; // false: read only (a platform admin's support access to a shared draft)
};

export type UploadFile = { filename: string; content_base64: string };

export type NewDraft = {
  documents: DocChoice[];
  // null: every guide of the documents' sources. A list: exactly these.
  guide_ids: number[] | null;
  extra_guides: UploadFile[];
  instruction: string;
  ai_override_source_ids: number[];
  // A form to fill: one from the list, or a one-off .docx (not both).
  template_id?: number | null;
  template_file?: UploadFile | null;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const MAX_DOCUMENTS = 10;
export const MAX_EXTRA_GUIDES = 3;
export const MAX_GUIDE_BYTES = 5_000_000;
export const MAX_INSTRUCTION_CHARS = 2_000;
export const GUIDE_TYPES = [".pdf", ".hwp", ".hwpx", ".docx", ".md", ".txt"];
export const MAX_ANSWER_CHARS = 4_000;

const sourceQuery = (sourceIds: number[]) => sourceIds.map((s) => `source_id=${s}`).join("&");

export const JOB_POLL_MS = 2_000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getJob = (id: string) => apiFetch<DraftJob>(`/docgen/jobs/${id}`);
const getDraft = (id: string) => apiFetch<DraftDetail>(`/docgen/drafts/${id}`);

/**
 * Waits until a job is done and returns it. A failed job is thrown as an ApiError carrying the
 * server's reason, so screens show it like any refused request. The job goes on at the server
 * even if nobody waits (the Drafts page shows open and failed jobs).
 */
export async function waitForJob(job: DraftJob, pollMs: number = JOB_POLL_MS): Promise<DraftJob> {
  let current = job;
  while (isOpenJob(current)) {
    await pause(pollMs);
    current = await getJob(current.id);
  }
  if (current.status === "failed") throw new ApiError(502, current.error ?? "");
  return current;
}

export const docgenApi = {
  status: () => apiFetch<DocgenStatus>("/docgen/status"),
  defaultGuides: (sourceIds: number[]) =>
    apiFetch<Guide[]>(`/docgen/guides?${sourceQuery(sourceIds)}`),
  // Starts the job, waits for it and returns the new draft. Refusals (limit, access, an AI-off
  // source) come back at once from the start call.
  create: async (body: NewDraft): Promise<DraftDetail> => {
    const job = await waitForJob(await apiFetch<DraftJob>("/docgen/drafts", json("POST", body)));
    return getDraft(job.draft_id!);
  },
  // A draft for one step of the user's IRB pipeline; returns the job (one open job per step).
  startStepDraft: (stepId: number, body: StepDraft) =>
    apiFetch<DraftJob>(`/docgen/steps/${stepId}/drafts`, json("POST", body)),
  // The drafts made in a pipeline's steps, newest first.
  pipelineDrafts: (pipelineId: number) => apiFetch<Draft[]>(`/docgen/pipelines/${pipelineId}/drafts`),
  // Open jobs, and jobs that failed in the last 24 hours.
  jobs: () => apiFetch<DraftJob[]>("/docgen/jobs"),
  job: getJob,
  list: () => apiFetch<Draft[]>("/docgen/drafts"),
  get: getDraft,
  // baseVersionNo: the version the edit started from; the server answers 409 if a newer one exists.
  saveEdit: (id: string, markdown: string, baseVersionNo: number) =>
    apiFetch<DraftVersion>(
      `/docgen/drafts/${id}/markdown`,
      json("PUT", { markdown, base_version_no: baseVersionNo }),
    ),
  // A template draft's hand edit: its answers instead of markdown.
  saveFields: (id: string, fields: Answers, baseVersionNo: number) =>
    apiFetch<DraftVersion>(
      `/docgen/drafts/${id}/markdown`,
      json("PUT", { fields, base_version_no: baseVersionNo }),
    ),
  templates: (sourceIds: number[]) => apiFetch<FormTemplate[]>(`/docgen/templates?${sourceQuery(sourceIds)}`),
  // The fields the server finds in a one-off form; nothing is stored or counted.
  checkTemplate: (file: UploadFile) =>
    apiFetch<{ filename: string; fields: FormField[] }>("/docgen/templates/check", json("POST", { file })),
  // inputs: new documents and guides from the side panel; omitted = the draft's current ones.
  // Starts the revision job, waits for it and returns the new (newest) version.
  revise: async (
    id: string,
    instruction: string,
    aiOverrideSourceIds: number[] = [],
    inputs?: ReviseInputs,
  ): Promise<DraftVersion> => {
    await waitForJob(
      await apiFetch<DraftJob>(
        `/docgen/drafts/${id}/revise`,
        json("POST", { instruction, ai_override_source_ids: aiOverrideSourceIds, ...(inputs ? { inputs } : {}) }),
      ),
    );
    const detail = await getDraft(id);
    return detail.versions[detail.versions.length - 1];
  },
  exportDocx: (id: string, versionNo: number) =>
    apiFetchFile(`/docgen/drafts/${id}/export?version_no=${versionNo}`, { method: "POST" }, "draft.docx"),
  remove: (id: string) => apiFetch<void>(`/docgen/drafts/${id}`, { method: "DELETE" }),

  // admin: the guide library
  guides: (includeArchived = false) =>
    apiFetch<Guide[]>(`/admin/guides?include_archived=${includeArchived}`),
  createGuide: (title: string, file: UploadFile) =>
    apiFetch<GuideWithText>("/admin/guides", json("POST", { title, file })),
  archiveGuide: (id: number) => apiFetch<void>(`/admin/guides/${id}`, { method: "DELETE" }),
  guide: (id: number) => apiFetch<GuideWithText>(`/admin/guides/${id}`),
  updateGuide: (id: number, body: { title?: string; is_global?: boolean }) =>
    apiFetch<Guide>(`/admin/guides/${id}`, json("PATCH", body)),
  replaceGuideFile: (id: number, file: UploadFile) =>
    apiFetch<GuideWithText>(`/admin/guides/${id}/file`, json("PUT", { file })),
  guideHistory: (id: number) => apiFetch<GuideRevision[]>(`/admin/guides/${id}/history`),
  // The full list of hospitals that use the guide (replaces the current one).
  setGuideHospitals: (id: number, hospitalIds: number[]) =>
    apiFetch<Guide>(`/admin/guides/${id}/hospitals`, json("PUT", { hospital_ids: hospitalIds })),
  hospitalGuides: (hospitalId: number) => apiFetch<Guide[]>(`/admin/hospitals/${hospitalId}/guides`),
  linkGuide: (hospitalId: number, guideId: number) =>
    apiFetch<void>(`/admin/hospitals/${hospitalId}/guides/${guideId}`, { method: "PUT" }),
  unlinkGuide: (hospitalId: number, guideId: number) =>
    apiFetch<void>(`/admin/hospitals/${hospitalId}/guides/${guideId}`, { method: "DELETE" }),

  // admin: form templates
  adminTemplates: (includeArchived = false) =>
    apiFetch<FormTemplate[]>(`/admin/templates?include_archived=${includeArchived}`),
  createTemplate: (title: string, docType: string, file: UploadFile) =>
    apiFetch<FormTemplate>("/admin/templates", json("POST", { title, doc_type: docType, file })),
  detectedFields: (id: number) => apiFetch<FormField[]>(`/admin/templates/${id}/detected`),
  saveTemplateFields: (id: number, fields: FieldEdit[]) =>
    apiFetch<FormTemplate>(`/admin/templates/${id}/fields`, json("PUT", { fields })),
  updateTemplate: (id: number, body: { title?: string; doc_type?: string; is_global?: boolean }) =>
    apiFetch<FormTemplate>(`/admin/templates/${id}`, json("PATCH", body)),
  replaceTemplateFile: (id: number, file: UploadFile) =>
    apiFetch<FormTemplate>(`/admin/templates/${id}/file`, json("PUT", { file })),
  setTemplateHospitals: (id: number, hospitalIds: number[]) =>
    apiFetch<FormTemplate>(`/admin/templates/${id}/hospitals`, json("PUT", { hospital_ids: hospitalIds })),
  archiveTemplate: (id: number) => apiFetch<void>(`/admin/templates/${id}`, { method: "DELETE" }),
};

/** Why a chosen form file cannot be sent, as a message key; null when it is fine. The server
 * checks again and says more (macros, a damaged file). */
export function templateFileProblem(file: File): "type" | "size" | "empty" | null {
  if (!file.name.toLowerCase().endsWith(".docx")) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_GUIDE_BYTES) return "size";
  return null;
}

/** The picked options of a tick-box answer. */
export function pickedOf(v: FieldValue | undefined): string[] {
  if (v === undefined) return [];
  return typeof v === "string" ? (v ? [v] : []) : v;
}

/** Two answer sets are the same (order of picked options counts, as on the server). */
export function sameAnswers(a: Answers, b: Answers): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.some((o, i) => o !== y[i])) return false;
    } else if (x !== y) {
      return false;
    }
  }
  return true;
}

/** A file from an <input type="file"> as base64 (the API takes files inside JSON). */
export async function toUpload(file: File): Promise<UploadFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { filename: file.name, content_base64: btoa(binary) };
}

/** Why a chosen guide file cannot be sent, as a message key; null when it is fine. */
export function guideFileProblem(file: File): "type" | "size" | "empty" | null {
  const name = file.name.toLowerCase();
  if (!GUIDE_TYPES.some((ext) => name.endsWith(ext))) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_GUIDE_BYTES) return "size";
  return null;
}

/** Elapsed time as m:ss, for the waiting screen. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
