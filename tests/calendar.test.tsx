import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { SessionAdmin, nextStates } from "../src/components/admin/session-admin";
import { CalendarView } from "../src/components/calendar/calendar-view";
import { emptySession, sessionProblem, toInput } from "../src/components/calendar/session-parts";
import { StepSession } from "../src/components/pipelines/step/step-session";
import { ProjectTasks } from "../src/components/projects/project-tasks";
import {
  ALL_TYPES,
  type CalendarData,
  type CalendarItem,
  type IrbSession,
  addDays,
  addMonths,
  filterItems,
  itemHref,
  monthGrid,
  step,
  viewRange,
  weekday,
} from "../src/lib/api/calendar";
import { ApiError } from "../src/lib/api/client";
import type { StepPage } from "../src/lib/api/pipelines";

const state = {
  calendar: null as CalendarData | null,
  calendarError: null as Error | null,
  calls: [] as unknown[][],
  sessions: [] as IrbSession[],
  tasks: [] as unknown[],
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/calendar",
}));

vi.mock("@/lib/api/calendar", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/calendar")>("../src/lib/api/calendar");
  const call = (name: string, result: () => unknown = () => ({})) => async (...args: unknown[]) => {
    state.calls.push([name, ...args]);
    return result();
  };
  return {
    ...actual,
    calendarApi: {
      get: async (...args: unknown[]) => {
        state.calls.push(["calendar", ...args]);
        if (state.calendarError) throw state.calendarError;
        return state.calendar;
      },
    },
    sessionApi: {
      forHospital: async () => state.sessions,
      propose: call("propose"),
      withdraw: call("withdraw"),
      kinds: async () => [
        { key: "regular", label: "Regular", position: 1, archived_at: null },
        { key: "other", label: "Other", position: 3, archived_at: null },
      ],
      proposals: async () => state.sessions.filter((s) => s.state === "proposed"),
      finder: async () => ({ enabled: false }),
      jobs: async () => [],
      update: call("updateSession"),
      create: call("createSession"),
      remove: call("removeSession"),
      find: call("find"),
      addKind: call("addKind"),
      updateKind: call("updateKind"),
    },
    taskApi: {
      list: async () => state.tasks,
      create: call("createTask"),
      update: call("updateTask"),
      remove: call("removeTask"),
      restore: call("restoreTask"),
    },
  };
});

vi.mock("@/lib/api/pipelines", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/pipelines")>("../src/lib/api/pipelines");
  return {
    ...actual,
    todaySeoul: () => "2026-11-20",
    pipelineApi: {
      updateStep: async (...args: unknown[]) => {
        state.calls.push(["updateStep", ...args]);
        return {};
      },
    },
  };
});

vi.mock("@/lib/api/admin", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/admin")>("../src/lib/api/admin");
  return {
    ...actual,
    adminApi: { hospitals: async () => ({ hospitals: [{ id: 4, name: "SNUH", note: "", created_at: "", updated_at: "", boards: [] }], board_kinds: [] }) },
  };
});

vi.mock("@/lib/api/sites", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/sites")>("../src/lib/api/sites");
  return { ...actual, siteApi: { list: async () => [] } };
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const KINDS = [
  { key: "regular", label: "Regular", position: 1, archived_at: null },
  { key: "other", label: "Other", position: 3, archived_at: null },
];

function item(over: Partial<CalendarItem>): CalendarItem {
  return {
    type: "task",
    date: "2026-11-20",
    time: null,
    title: "x",
    project_id: null,
    project_name: null,
    hospital_id: null,
    hospital_name: null,
    site_id: null,
    site_label: "",
    pipeline_id: null,
    step_id: null,
    status_label: "",
    closed: false,
    session_id: null,
    session_state: null,
    kind_key: null,
    target_step_ids: [],
    task_id: null,
    done: false,
    assignee_id: null,
    ...over,
  };
}

function session(over: Partial<IrbSession>): IrbSession {
  return {
    id: 1,
    hospital_id: 4,
    kind_key: "regular",
    meets_on: "2026-12-10",
    meets_at: null,
    cutoff_on: "2026-12-03",
    cutoff_at: null,
    timezone: "Asia/Seoul",
    state: "confirmed",
    origin: "admin",
    note: "",
    evidence_version_id: null,
    evidence_url: null,
    evidence_quote: null,
    proposed_by: null,
    proposed_by_me: false,
    proposed_at: null,
    reviewed_by: null,
    reviewed_at: null,
    job_id: null,
    deleted_at: null,
    ...over,
  };
}

const DATA: CalendarData = {
  start: "2026-10-26",
  end: "2026-12-06",
  items: [
    item({ type: "step_due", date: "2026-11-24", title: "1차 변경심의", project_id: 1, project_name: "Study A", hospital_id: 4, hospital_name: "SNUH", pipeline_id: 9, step_id: 21, site_id: 50, site_label: "PI Kim" }),
    item({ type: "session_cutoff", date: "2026-12-03", title: "Regular", hospital_id: 4, hospital_name: "SNUH", session_id: 1, session_state: "confirmed", kind_key: "regular", target_step_ids: [21] }),
    item({ type: "session_meeting", date: "2026-11-27", title: "Other", hospital_id: 5, hospital_name: "Ewha", session_id: 2, session_state: "proposed", kind_key: "other" }),
    item({ type: "task", date: "2026-11-20", title: "Sponsor call", project_id: 2, project_name: "Study B", task_id: 7 }),
    item({ type: "task", date: "2026-11-21", title: "Old", project_id: 1, project_name: "Study A", task_id: 8, done: true }),
  ],
  projects: { "1": "Study A", "2": "Study B" },
  hospitals: { "4": "SNUH", "5": "Ewha" },
  sites: { "50": { label: "PI Kim", hospital_id: 4 } },
  kinds: KINDS,
  project_hospitals: { "1": [4], "2": [5] },
};

beforeEach(() => {
  state.calendar = DATA;
  state.calendarError = null;
  state.calls = [];
  state.sessions = [];
  state.tasks = [];
});
afterEach(() => cleanup());

describe("calendar dates", () => {
  it("builds Monday-first month grids of whole weeks", () => {
    const grid = monthGrid("2026-11-20");
    expect(grid[0]).toBe("2026-10-26"); // the Monday before 1 November (a Sunday)
    expect(grid[grid.length - 1]).toBe("2026-12-06");
    expect(grid.length % 7).toBe(0);
    expect(weekday("2026-11-23")).toBe(0);
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("asks the server for at most 62 days per view", () => {
    for (const mode of ["month", "week", "list"] as const) {
      const r = viewRange(mode, "2026-11-20");
      const days = (Date.parse(r.end) - Date.parse(r.start)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(62);
    }
    expect(viewRange("week", "2026-11-20")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(step("week", "2026-11-20", 1)).toBe("2026-11-23");
    expect(step("list", "2026-11-20", -1)).toBe("2026-10-23");
  });
});

describe("calendar filters", () => {
  const all = { projectId: null, siteId: null, hospitalId: null, types: ALL_TYPES, kindKey: null, hideDone: false };
  it("keeps sessions of the project's or site's hospital", () => {
    const p1 = filterItems(DATA.items, { ...all, projectId: 1 }, DATA).map((i) => i.title);
    expect(p1).toEqual(["1차 변경심의", "Regular", "Old"]);
    const p2 = filterItems(DATA.items, { ...all, projectId: 2 }, DATA).map((i) => i.title);
    expect(p2).toEqual(["Other", "Sponsor call"]);
    const site = filterItems(DATA.items, { ...all, siteId: 50 }, DATA).map((i) => i.title);
    expect(site).toEqual(["1차 변경심의", "Regular"]);
  });
  it("filters by type, kind and done", () => {
    expect(filterItems(DATA.items, { ...all, types: new Set(["tasks"]) }, DATA)).toHaveLength(2);
    expect(filterItems(DATA.items, { ...all, kindKey: "regular" }, DATA).filter((i) => i.session_id)).toHaveLength(1);
    expect(filterItems(DATA.items, { ...all, hideDone: true }, DATA).map((i) => i.title)).not.toContain("Old");
    expect(filterItems(DATA.items, { ...all, hospitalId: 5 }, DATA).map((i) => i.title)).toEqual(["Other"]);
  });
  it("links steps and tasks; sessions open their panel", () => {
    expect(itemHref(DATA.items[0])).toBe("/pipelines/9/steps/21");
    expect(itemHref(DATA.items[3])).toBe("/projects/2");
    expect(itemHref(DATA.items[1])).toBeNull();
  });
});

describe("session form rules", () => {
  it("checks and converts the fields; an empty time stays unknown", () => {
    const v = { ...emptySession(KINDS), meets_on: "2026-12-10", cutoff_at: "17:00" };
    expect(sessionProblem(v)).toBe("cutoffTimeNeedsDate");
    expect(sessionProblem({ ...v, cutoff_at: "", cutoff_on: "2026-12-11" })).toBe("cutoffAfterMeeting");
    expect(sessionProblem({ ...v, cutoff_at: "", evidence_url: "javascript:x" })).toBe("badLink");
    expect(sessionProblem({ ...v, meets_on: "" })).toBe("needMeeting");
    const input = toInput({ ...v, cutoff_at: "17:00", cutoff_on: "" });
    expect(input).toMatchObject({ kind_key: "regular", meets_at: null, cutoff_on: null, cutoff_at: null, evidence_url: null });
  });
  it("offers the server's state moves", () => {
    expect(nextStates("proposed")).toEqual(["confirmed", "tentative", "rejected"]);
    expect(nextStates("cancelled")).toEqual(["tentative"]);
  });
});

describe("CalendarView", () => {
  it("shows step dates, sessions (proposals marked) and tasks in the month", async () => {
    wrap(<CalendarView />);
    expect(await screen.findByText("1차 변경심의", { exact: false })).toBeTruthy();
    const grid = screen.getByRole("grid");
    expect(within(grid).getByText(/Sponsor call/)).toBeTruthy();
    expect(within(grid).getAllByText(/not confirmed/).length).toBeGreaterThan(0);
    expect(state.calls[0]).toEqual(["calendar", "2026-10-26", "2026-12-06"]);
    // The step links to its page.
    expect(screen.getByText(/1차 변경심의/).closest("a")?.getAttribute("href")).toBe("/pipelines/9/steps/21");
  });

  it("switches to the list and filters by project", async () => {
    wrap(<CalendarView />);
    await screen.findByRole("grid");
    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    await waitFor(() => expect(state.calls.some((c) => c[1] === "2026-11-20" && c[2] === "2026-12-17")).toBe(true));
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "2" } });
    const list = await screen.findByRole("list", { name: "List" });
    expect(within(list).queryByText(/1차 변경심의/)).toBeNull();
    expect(within(list).getByText(/Sponsor call/)).toBeTruthy();
  });

  it("opens a session with its facts and lets the proposer withdraw", async () => {
    state.sessions = [session({ id: 2, hospital_id: 5, kind_key: "other", meets_on: "2026-11-27", cutoff_on: null, state: "proposed", origin: "user", proposed_by_me: true, evidence_quote: "<b>quoted</b>" })];
    wrap(<CalendarView />);
    await screen.findByRole("grid");
    fireEvent.click(screen.getAllByRole("button", { name: /Other/ })[0]);
    const panel = await screen.findByRole("region", { name: "IRB session" });
    expect(await within(panel).findByText(/time unknown/)).toBeTruthy();
    expect(within(panel).getByText("<b>quoted</b>")).toBeTruthy(); // plain text, never HTML
    fireEvent.click(within(panel).getByRole("button", { name: "Withdraw my proposal" }));
    await waitFor(() => expect(state.calls).toContainEqual(["withdraw", 2]));
  });

  it("says why it failed instead of showing an empty calendar", async () => {
    state.calendarError = new ApiError(422, "ask for at most 62 days at a time");
    wrap(<CalendarView />);
    expect((await screen.findByRole("alert")).textContent).toContain("ask for at most 62 days");
    expect(screen.queryByText(/Nothing in this period/)).toBeNull();
  });

  it("sends a proposal for one of the user's hospitals", async () => {
    wrap(<CalendarView />);
    await screen.findByRole("grid");
    fireEvent.click(screen.getByRole("button", { name: "Propose an IRB session" }));
    const form = await screen.findByRole("region", { name: "Propose an IRB session" });
    fireEvent.change(within(form).getByLabelText("Hospital"), { target: { value: "5" } });
    fireEvent.change(within(form).getByLabelText("Meeting date"), { target: { value: "2026-12-15" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send proposal" }));
    await waitFor(() => expect(state.calls.find((c) => c[0] === "propose")?.[1]).toBe(5));
    expect((state.calls.find((c) => c[0] === "propose")?.[2] as { meets_on: string }).meets_on).toBe("2026-12-15");
  });
});

const STEP_PAGE = {
  pipeline: { id: 9, project_id: 1, hospital_id: 4, hospital_name: "SNUH", in_project: true, steps: 1, closed_steps: 0, created_at: "", updated_at: "", deleted_at: null },
  step: { id: 21, step_type_id: 1, step_type_name: null, name: "Amendment", position: 1, status_key: "not_started", due_on: null, submitted_on: null, decided_on: null, note: "", deleted_at: null },
  session_kinds: KINDS,
} as unknown as StepPage;

describe("StepSession", () => {
  it("highlights the suggestion but saves only what the user picks", async () => {
    const next = session({ id: 3 });
    wrap(<StepSession pipelineId={9} page={{ ...STEP_PAGE, sessions: [next], suggested_session_id: 3 }} readOnly={false} />);
    expect(screen.getByText("No target meeting chosen yet.")).toBeTruthy();
    expect(state.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /^Use Regular 2026-12-10/ }));
    await waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { target_session_id: 3 }]));
  });

  it("warns about a cancelled target and a failed read", () => {
    const target = session({ id: 4, state: "cancelled" });
    const { unmount } = wrap(<StepSession pipelineId={9} page={{ ...STEP_PAGE, target_session: target, target_warning: "cancelled" }} readOnly={false} />);
    expect(screen.getByRole("alert").textContent).toContain("cancelled");
    unmount();
    wrap(<StepSession pipelineId={9} page={{ ...STEP_PAGE, target_warning: "unavailable" }} readOnly={false} />);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByLabelText("Aim for")).toBeNull();
  });

  it("is read-only for viewers", () => {
    wrap(<StepSession pipelineId={9} page={{ ...STEP_PAGE, sessions: [session({})] }} readOnly />);
    expect(screen.queryByLabelText("Aim for")).toBeNull();
  });
});

describe("SessionAdmin", () => {
  it("reviews a proposal and explains why the AI search is off", async () => {
    state.sessions = [session({ id: 5, state: "proposed", origin: "ai", evidence_quote: "12월 정기심의 12-10", evidence_version_id: 70 })];
    wrap(<SessionAdmin />);
    const review = await screen.findByText("Proposals to review (1)");
    const box = review.closest("section")!;
    expect(within(box).getByText("the AI search (proposal)")).toBeTruthy();
    expect(within(box).getByText("12월 정기심의 12-10")).toBeTruthy();
    fireEvent.click(within(box).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(state.calls).toContainEqual(["updateSession", 5, { state: "confirmed" }]));
    expect(await screen.findByText(/not set up on this server/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Find sessions" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ProjectTasks", () => {
  it("lists open tasks, ticks one off and adds one", async () => {
    state.tasks = [
      { id: 7, project_id: 1, title: "Sponsor call", due_on: "2026-11-18", due_at: "14:00", note: "", site_id: null, step_id: null, assignee_id: "u", assignee_name: "Lee", done: false, done_at: null, done_by: null, created_by: null, created_at: "", updated_at: "", deleted_at: null },
    ];
    wrap(<ProjectTasks projectId={1} />);
    expect(await screen.findByText("Sponsor call")).toBeTruthy();
    expect(screen.getByText("2 day(s) overdue")).toBeTruthy();
    expect(screen.getByText("for Lee")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Mark as done"));
    await waitFor(() => expect(state.calls).toContainEqual(["updateTask", 7, { done: true }]));
    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "Internal review" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(state.calls.find((c) => c[0] === "createTask")?.[2]).toMatchObject({ title: "Internal review", due_on: "2026-11-20", assignee_id: null }));
  });
});
