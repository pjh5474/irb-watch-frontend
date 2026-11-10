import { apiFetch } from "@/lib/api/client";

// Admin-edited AI instructions (backend `api/admin_ai.py`). The text is added AFTER each
// feature's fixed safety rules; it cannot remove them. Typed by hand like the other new routes.

export const FEATURES = ["agent", "docgen", "summary"] as const;
export type Feature = (typeof FEATURES)[number];
export const MAX_CHARS = 4_000;
export const SUMMARY_KINDS = ["document", "change", "new"] as const;

export type InstructionVersion = {
  id: number;
  feature: Feature;
  body: string;
  created_by: string | null;
  created_at: string;
  restored_from: number | null;
};

export type CurrentInstructions = { feature: Feature; current: InstructionVersion | null };

export type TestResult = { text: string; note: string };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const aiApi = {
  current: () => apiFetch<CurrentInstructions[]>("/admin/ai/instructions"),
  history: (feature: Feature) => apiFetch<InstructionVersion[]>(`/admin/ai/instructions/${feature}/history`),
  save: (feature: Feature, body: string) =>
    apiFetch<InstructionVersion>(`/admin/ai/instructions/${feature}`, json("PUT", { body })),
  reset: (feature: Feature) =>
    apiFetch<InstructionVersion>(`/admin/ai/instructions/${feature}/reset`, { method: "POST" }),
  restore: (feature: Feature, versionId: number) =>
    apiFetch<InstructionVersion>(`/admin/ai/instructions/${feature}/restore/${versionId}`, { method: "POST" }),
  // `question`: the chat question, the docs request, or the summary kind.
  test: (feature: Feature, body: string, documentId: number | null, question: string) =>
    apiFetch<TestResult>(
      `/admin/ai/instructions/${feature}/test`,
      json("POST", { body, document_id: documentId, question }),
    ),
};
