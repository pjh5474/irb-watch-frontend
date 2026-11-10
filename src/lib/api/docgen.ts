import { apiFetch, apiFetchFile } from "@/lib/api/client";

// The docs generator's routes (backend `api/docgen.py` and `api/admin_guides.py`). Typed by
// hand like the other new routes; replace with the generated schemas after `gen:api-types`.

export type DocgenStatus = { enabled: boolean; used: number; limit: number; reason: string | null };

export type Guide = {
  id: number;
  title: string;
  filename: string;
  chars: number;
  source_ids: number[];
  created_at: string;
  archived_at: string | null;
};

export type GuideWithText = Guide & { body_text: string };

export type DocRef = { document_id: number; version_no: number; source_id: number };

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
};

export type DraftVersion = {
  version_no: number;
  markdown: string;
  origin: "ai" | "user_edit" | "ai_revision";
  instruction: string;
  created_at: string;
};

export type DraftDetail = { draft: Draft; versions: DraftVersion[]; guides: Guide[] };

export type UploadFile = { filename: string; content_base64: string };

export type NewDraft = {
  documents: { document_id: number; version_no: number | null }[];
  // null: every guide of the documents' sources. A list: exactly these.
  guide_ids: number[] | null;
  extra_guides: UploadFile[];
  instruction: string;
  ai_override_source_ids: number[];
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const MAX_DOCUMENTS = 10;
export const MAX_EXTRA_GUIDES = 3;
export const MAX_GUIDE_BYTES = 5_000_000;
export const MAX_INSTRUCTION_CHARS = 2_000;
export const GUIDE_TYPES = [".pdf", ".hwp", ".hwpx", ".docx", ".md", ".txt"];

export const docgenApi = {
  status: () => apiFetch<DocgenStatus>("/docgen/status"),
  defaultGuides: (sourceIds: number[]) =>
    apiFetch<Guide[]>(`/docgen/guides?${sourceIds.map((s) => `source_id=${s}`).join("&")}`),
  create: (body: NewDraft) => apiFetch<DraftDetail>("/docgen/drafts", json("POST", body)),
  list: () => apiFetch<Draft[]>("/docgen/drafts"),
  get: (id: string) => apiFetch<DraftDetail>(`/docgen/drafts/${id}`),
  // baseVersionNo: the version the edit started from; the server answers 409 if a newer one exists.
  saveEdit: (id: string, markdown: string, baseVersionNo: number) =>
    apiFetch<DraftVersion>(
      `/docgen/drafts/${id}/markdown`,
      json("PUT", { markdown, base_version_no: baseVersionNo }),
    ),
  revise: (id: string, instruction: string, aiOverrideSourceIds: number[] = []) =>
    apiFetch<DraftVersion>(
      `/docgen/drafts/${id}/revise`,
      json("POST", { instruction, ai_override_source_ids: aiOverrideSourceIds }),
    ),
  exportDocx: (id: string, versionNo: number) =>
    apiFetchFile(`/docgen/drafts/${id}/export?version_no=${versionNo}`, { method: "POST" }, "draft.docx"),
  remove: (id: string) => apiFetch<void>(`/docgen/drafts/${id}`, { method: "DELETE" }),

  // admin: the guide library
  guides: (includeArchived = false) =>
    apiFetch<Guide[]>(`/admin/guides?include_archived=${includeArchived}`),
  createGuide: (title: string, file: UploadFile) =>
    apiFetch<GuideWithText>("/admin/guides", json("POST", { title, file })),
  archiveGuide: (id: number) => apiFetch<void>(`/admin/guides/${id}`, { method: "DELETE" }),
  sourceGuides: (sourceId: number) => apiFetch<Guide[]>(`/admin/sources/${sourceId}/guides`),
  linkGuide: (sourceId: number, guideId: number) =>
    apiFetch<void>(`/admin/sources/${sourceId}/guides/${guideId}`, { method: "PUT" }),
  unlinkGuide: (sourceId: number, guideId: number) =>
    apiFetch<void>(`/admin/sources/${sourceId}/guides/${guideId}`, { method: "DELETE" }),
};

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
