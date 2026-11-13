import { apiFetch } from "@/lib/api/client";
import type { DraftJob } from "@/lib/api/docgen";

// The user's open IRB work over all projects (phase A2). Served by the backend.

export type WorkStep = {
  pipeline_id: number;
  project_id: number;
  project_name: string | null;
  hospital_id: number;
  hospital_name: string | null;
  step_id: number;
  step_name: string;
  status_key: string;
  status_label: string;
  due_on: string | null;
  submitted_on: string | null;
  days_left: number | null; // to the due date; negative = overdue
  required: number;
  required_missing: number;
  mine?: boolean; // in a project the user owns
  site_label?: string; // "01 · PI 김○○"; empty for an unnamed site
};

export type Work = {
  today: string; // Seoul
  window_days: number;
  due: WorkStep[]; // overdue or due within window_days; never submitted steps
  waiting: WorkStep[]; // submitted, no decision yet
  missing: WorkStep[]; // open, not submitted, required documents missing
  drafts: { job: DraftJob; step: WorkStep }[]; // AI drafts being written or failed in 24 h
};

export const workApi = {
  /** mine: only projects the user owns (shared and organization projects left out). */
  get: (mine = false) => apiFetch<Work>(`/work${mine ? "?mine=true" : ""}`),
};
