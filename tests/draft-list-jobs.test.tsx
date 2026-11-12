import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { DraftList } from "../src/components/drafts/draft-list";

const state = vi.hoisted(() => ({ jobs: [] as unknown[], drafts: [] as unknown[], jobsError: null as unknown }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    docgenApi: {
      list: async () => state.drafts,
      status: async () => ({ enabled: true, used: 1, limit: 10, reason: null }),
      jobs: async () => {
        if (state.jobsError) throw state.jobsError;
        return state.jobs;
      },
    },
  };
});

const job = (status: string, extra: object = {}) => ({
  id: `j-${status}`,
  kind: "draft",
  status,
  error: null,
  draft_id: null,
  pipeline_step_id: null,
  created_at: "2026-11-12T01:00:00Z",
  finished_at: null,
  ...extra,
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        <DraftList />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.jobs = [];
  state.drafts = [];
  state.jobsError = null;
});
afterEach(cleanup);

describe("the Drafts page shows draft jobs", () => {
  it("a job being written and one that failed with its reason", async () => {
    state.jobs = [
      job("running", { kind: "revision" }),
      job("failed", { error: "the server restarted while this was being written; start it again", finished_at: "2026-11-12T01:05:00Z" }),
    ];
    show();
    expect(await screen.findByText("A revision is being written… You can leave this page.")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toMatch(/A draft failed at .*: the server restarted/);
  });

  it("nothing when there are no jobs, and marks drafts made in a pipeline", async () => {
    state.drafts = [
      { id: "d1", title: "Step draft", documents: [], step_files: [{ name: "Protocol" }], pipeline_step_id: 21, updated_at: "2026-11-12T02:00:00Z" },
    ];
    show();
    expect(await screen.findByText("Step draft")).toBeTruthy();
    expect(screen.getByText("IRB pipeline")).toBeTruthy();
    expect(screen.getByText(/1 document/)).toBeTruthy(); // its own file counts
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the jobs cannot be loaded (never looks like 'no jobs')", async () => {
    state.jobsError = new Error("down");
    show();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("has the same job and step-draft messages in both languages", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(ko.drafts.jobs)).toEqual(keys(en.drafts.jobs));
    expect(keys(ko.pipelines.drafts)).toEqual(keys(en.pipelines.drafts));
  });
});
