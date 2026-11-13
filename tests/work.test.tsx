import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { WorkView } from "../src/components/work/work-view";
import { ApiError } from "../src/lib/api/client";
import type { Work, WorkStep } from "../src/lib/api/work";

const step = (id: number, extra: Partial<WorkStep> = {}): WorkStep => ({
  pipeline_id: 9,
  project_id: 1,
  project_name: "Study A",
  hospital_id: 4,
  hospital_name: "SNUH",
  step_id: id,
  step_name: `Step ${id}`,
  status_key: "preparing",
  status_label: "Preparing",
  due_on: null,
  submitted_on: null,
  days_left: null,
  required: 0,
  required_missing: 0,
  ...extra,
});

const state = vi.hoisted(() => ({ work: null as unknown, error: null as unknown }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/work", () => ({
  workApi: {
    get: async () => {
      if (state.error) throw state.error;
      return state.work;
    },
  },
}));

const EMPTY: Work = { today: "2026-11-20", window_days: 14, due: [], waiting: [], missing: [], drafts: [] };

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        <WorkView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.work = EMPTY;
  state.error = null;
});
afterEach(cleanup);

describe("WorkView", () => {
  it("lists due, waiting, missing and draft lines, each linking to its step page", async () => {
    state.work = {
      ...EMPTY,
      due: [step(1, { due_on: "2026-11-18", days_left: -2 }), step(2, { due_on: "2026-11-25", days_left: 5 })],
      waiting: [step(3, { status_label: "Submitted", submitted_on: "2026-11-01" })],
      missing: [step(4, { required: 3, required_missing: 2 })],
      drafts: [
        {
          job: {
            id: "j1", kind: "draft", status: "failed", error: "the AI timed out", draft_id: null,
            pipeline_step_id: 5, created_at: "2026-11-20T01:00:00Z", finished_at: "2026-11-20T01:02:00Z",
          },
          step: step(5),
        },
      ],
    } satisfies Work;
    show();
    const due = within((await screen.findByRole("heading", { name: /Overdue or due within 14 days/ })).closest("section") as HTMLElement);
    expect(due.getByRole("link", { name: "Step 1" }).getAttribute("href")).toBe("/pipelines/9/steps/1");
    expect(due.getByText("2 days overdue")).toBeTruthy();
    expect(due.getByText("due in 5 days")).toBeTruthy();
    expect(screen.getByText("submitted 2026-11-01")).toBeTruthy();
    expect(screen.getByText("2 of 3 required missing")).toBeTruthy();
    expect(screen.getAllByText("Study A · SNUH").length).toBe(5);
    expect((screen.getByRole("alert")).textContent).toContain("the AI timed out"); // a failure shows its reason
  });

  it("says so when there is nothing to do", async () => {
    show();
    expect(await screen.findByText(/Nothing to do right now/)).toBeTruthy();
  });

  it("shows the server's reason when the list cannot be loaded", async () => {
    state.error = new ApiError(503, "the server is busy");
    show();
    expect((await screen.findByRole("alert")).textContent).toBe("the server is busy");
  });
});
