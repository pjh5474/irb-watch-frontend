import { apiFetch } from "@/lib/api/client";

// The IRB calendar (CAL-1): hospital IRB sessions (meetings with a submission cutoff), project
// tasks, and one calendar over step dates, sessions and tasks. Served by the backend; the
// browser never reads the tables.

export type SessionState = "proposed" | "tentative" | "confirmed" | "cancelled" | "rejected";

export type SessionKind = { key: string; label: string; position: number; archived_at: string | null };

export type IrbSession = {
  id: number;
  hospital_id: number;
  kind_key: string;
  meets_on: string;
  meets_at: string | null; // null: time unknown
  cutoff_on: string | null;
  cutoff_at: string | null;
  timezone: string;
  state: SessionState; // proposed = not confirmed by an admin yet
  origin: "admin" | "user" | "ai";
  note: string;
  evidence_version_id: number | null;
  evidence_url: string | null;
  evidence_quote: string | null; // untrusted text copied from a post: plain text only
  proposed_by: string | null; // a name
  proposed_by_me: boolean;
  proposed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  job_id: string | null;
  deleted_at: string | null;
};

export type SessionInput = {
  kind_key?: string | null;
  meets_on: string;
  meets_at?: string | null;
  cutoff_on?: string | null;
  cutoff_at?: string | null;
  timezone?: string | null;
  note?: string;
  evidence_url?: string | null;
};

export type SessionChange = Partial<SessionInput & { evidence_version_id: number | null; state: SessionState }>;

export type SessionJob = {
  id: string;
  hospital_id: number;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  documents_read: number;
  proposed: number;
  skipped: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ProjectTask = {
  id: number;
  project_id: number;
  title: string;
  due_on: string;
  due_at: string | null;
  note: string;
  site_id: number | null;
  step_id: number | null;
  assignee_id: string | null;
  assignee_name: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TaskInput = {
  title: string;
  due_on: string;
  due_at?: string | null;
  note?: string;
  site_id?: number | null;
  step_id?: number | null;
  assignee_id?: string | null;
};

export type TaskChange = Partial<TaskInput & { done: boolean }>;

export type CalendarItemType =
  | "step_due"
  | "step_submitted"
  | "step_decided"
  | "session_meeting"
  | "session_cutoff"
  | "task";

export type CalendarItem = {
  type: CalendarItemType;
  date: string;
  time: string | null;
  title: string; // step label, session kind label, or task title
  project_id: number | null;
  project_name: string | null;
  hospital_id: number | null;
  hospital_name: string | null;
  site_id: number | null;
  site_label: string;
  pipeline_id: number | null;
  step_id: number | null;
  status_label: string;
  closed: boolean;
  session_id: number | null;
  session_state: SessionState | null;
  kind_key: string | null;
  target_step_ids: number[]; // the user's steps aiming for this session
  task_id: number | null;
  done: boolean;
  assignee_id: string | null;
};

export type CalendarData = {
  start: string;
  end: string;
  items: CalendarItem[];
  projects: Record<string, string>;
  hospitals: Record<string, string>;
  sites: Record<string, { label: string; hospital_id: number }>;
  kinds: SessionKind[];
  project_hospitals: Record<string, number[]>; // project -> its hospitals (the filters)
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const calendarApi = {
  /** At most 62 days. Sessions of the hospitals of the user's projects, plus `hospitalIds`. */
  get: (start: string, end: string, hospitalIds: number[] = []) => {
    const q = new URLSearchParams({ start, end });
    for (const h of hospitalIds) q.append("hospital_id", String(h));
    return apiFetch<CalendarData>(`/calendar?${q.toString()}`);
  },
};

/** Why a date was suggested: the post it was read from, for every signed-in user. Never the post's text. */
export type SessionSource = {
  session_id: number;
  hospital_id: number | null;
  hospital_name: string | null;
  board: string;
  title: string; // untrusted page text: plain text only
  posted_on: string | null;
  quote: string | null; // untrusted: plain text only
  origin: "admin" | "user" | "ai";
};

/** The AI found it and no admin has reviewed it: shown with an "AI, not confirmed" mark. */
export const isUnreviewedAi = (s: Pick<IrbSession, "origin" | "state" | "reviewed_at">) =>
  s.origin === "ai" && s.state === "proposed" && !s.reviewed_at;

/** The submission cutoff is known and already behind us, while the meeting is still ahead (or today). */
export const cutoffPassed = (s: Pick<IrbSession, "cutoff_on" | "meets_on">, today: string) =>
  !!s.cutoff_on && s.cutoff_on < today && s.meets_on >= today;

export const sessionApi = {
  source: (id: number) => apiFetch<SessionSource>(`/sessions/${id}/source`),
  kinds: (includeArchived = false) =>
    apiFetch<SessionKind[]>(`/session-kinds${includeArchived ? "?include_archived=true" : ""}`),
  forHospital: (hospitalId: number, start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    const s = q.toString();
    return apiFetch<IrbSession[]>(`/hospitals/${hospitalId}/sessions${s ? `?${s}` : ""}`);
  },
  /** A proposal; an admin reviews it. */
  propose: (hospitalId: number, body: SessionInput) =>
    apiFetch<IrbSession>(`/hospitals/${hospitalId}/sessions`, json("POST", body)),
  withdraw: (id: number) => apiFetch<IrbSession>(`/sessions/${id}/withdraw`, { method: "POST" }),
  // platform admins
  proposals: () => apiFetch<IrbSession[]>(`/admin/sessions/proposals`),
  create: (hospitalId: number, body: SessionInput & { state?: "tentative" | "confirmed"; evidence_version_id?: number | null }) =>
    apiFetch<IrbSession>(`/admin/hospitals/${hospitalId}/sessions`, json("POST", body)),
  update: (id: number, change: SessionChange) => apiFetch<IrbSession>(`/admin/sessions/${id}`, json("PATCH", change)),
  remove: (id: number) => apiFetch<IrbSession>(`/admin/sessions/${id}/remove`, { method: "POST" }),
  find: (hospitalId: number) => apiFetch<SessionJob>(`/admin/hospitals/${hospitalId}/sessions/find`, { method: "POST" }),
  jobs: (hospitalId?: number) =>
    apiFetch<SessionJob[]>(`/admin/session-jobs${hospitalId === undefined ? "" : `?hospital_id=${hospitalId}`}`),
  job: (id: string) => apiFetch<SessionJob>(`/admin/session-jobs/${id}`),
  finder: () => apiFetch<{ enabled: boolean }>(`/admin/session-finder`),
  addKind: (key: string, label: string) => apiFetch<SessionKind>(`/admin/session-kinds`, json("POST", { key, label })),
  updateKind: (key: string, change: Partial<{ label: string; position: number; archived: boolean }>) =>
    apiFetch<SessionKind>(`/admin/session-kinds/${key}`, json("PATCH", change)),
};

export const taskApi = {
  list: (projectId: number, includeRemoved = false) =>
    apiFetch<ProjectTask[]>(`/projects/${projectId}/tasks${includeRemoved ? "?include_removed=true" : ""}`),
  create: (projectId: number, body: TaskInput) => apiFetch<ProjectTask>(`/projects/${projectId}/tasks`, json("POST", body)),
  update: (id: number, change: TaskChange) => apiFetch<ProjectTask>(`/tasks/${id}`, json("PATCH", change)),
  remove: (id: number) => apiFetch<ProjectTask>(`/tasks/${id}/remove`, { method: "POST" }),
  restore: (id: number) => apiFetch<ProjectTask>(`/tasks/${id}/restore`, { method: "POST" }),
};

// -- dates (all YYYY-MM-DD, calendar days without a time zone) ----------------------------------

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  return fromMs(toMs(day) + n * DAY);
}

/** 0 = Monday … 6 = Sunday (the calendar's weeks start on Monday, as in Korea's work week). */
export function weekday(day: string): number {
  return (new Date(toMs(day)).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: string): string {
  return addDays(day, -weekday(day));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, n: number): string {
  const [y, m] = day.slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** The days a month grid shows: whole weeks from the Monday before the 1st to the Sunday after the last day. */
export function monthGrid(day: string): string[] {
  const first = startOfMonth(day);
  const last = addDays(addMonths(first, 1), -1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekDays(day: string): string[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export type CalendarMode = "month" | "week" | "list";

/** The range one view asks the server for (at most 62 days). The list shows 4 weeks. */
export function viewRange(mode: CalendarMode, day: string): { start: string; end: string } {
  if (mode === "month") {
    const grid = monthGrid(day);
    return { start: grid[0], end: grid[grid.length - 1] };
  }
  if (mode === "week") {
    const days = weekDays(day);
    return { start: days[0], end: days[6] };
  }
  return { start: day, end: addDays(day, 27) };
}

export function step(mode: CalendarMode, day: string, n: number): string {
  if (mode === "month") return addMonths(day, n);
  if (mode === "week") return addDays(startOfWeek(day), 7 * n);
  return addDays(day, 28 * n);
}

export type CalendarFilter = {
  projectId: number | null;
  siteId: number | null;
  hospitalId: number | null;
  types: Set<"steps" | "sessions" | "tasks">;
  kindKey: string | null;
  hideDone: boolean;
};

export const ALL_TYPES = new Set<"steps" | "sessions" | "tasks">(["steps", "sessions", "tasks"]);

export function group(type: CalendarItemType): "steps" | "sessions" | "tasks" {
  return type.startsWith("step_") ? "steps" : type.startsWith("session_") ? "sessions" : "tasks";
}

/** The items a filter keeps. Sessions belong to a hospital, not a project: a project filter
 * keeps the sessions of that project's hospitals, a site filter those of the site's hospital. */
export function filterItems(
  items: CalendarItem[],
  f: CalendarFilter,
  data: Pick<CalendarData, "project_hospitals" | "sites">,
): CalendarItem[] {
  return items.filter((i) => {
    const g = group(i.type);
    if (!f.types.has(g)) return false;
    if (f.hospitalId !== null && i.hospital_id !== f.hospitalId) return false;
    if (f.kindKey !== null && g === "sessions" && i.kind_key !== f.kindKey) return false;
    if (f.hideDone && (i.done || (g === "steps" && i.closed))) return false;
    if (g === "sessions") {
      if (f.projectId !== null && !(data.project_hospitals[String(f.projectId)] ?? []).includes(i.hospital_id ?? -1))
        return false;
      if (f.siteId !== null && data.sites[String(f.siteId)]?.hospital_id !== i.hospital_id) return false;
      return true;
    }
    if (f.projectId !== null && i.project_id !== f.projectId) return false;
    if (f.siteId !== null && i.site_id !== f.siteId) return false;
    return true;
  });
}

/** The page a calendar item opens, or null (a session opens its own panel). */
export function itemHref(i: CalendarItem): string | null {
  if (i.pipeline_id !== null && i.step_id !== null) return `/pipelines/${i.pipeline_id}/steps/${i.step_id}`;
  if (i.type === "task" && i.project_id !== null) return `/projects/${i.project_id}`;
  return null;
}

/** "10:00", or "" when the time is unknown. */
export const timeLabel = (t: string | null) => (t ? t.slice(0, 5) : "");
