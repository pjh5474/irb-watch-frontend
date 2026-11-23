import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { StepNewPlan } from "../src/components/pipelines/step/step-new-plan";
import {
  type PlanField,
  type PlanForm,
  type PlanRun,
  codePrefix,
  isShown,
  unwrapValues,
  valuesToSave,
} from "../src/lib/api/new-plan";

function field(over: Partial<PlanField> & { key: string }): PlanField {
  return {
    kind: "text", label: over.key, basis: "optional", required: false, options: [], note: "", show_when: [],
    types: null, multiple: false, max_length: null, numeric: false, dynamic_options: false, supported: true,
    code_prefix_of: null, code_prefixes: null, ...over,
  };
}

const FIELDS: PlanField[] = [
  field({ key: "study.title_ko", kind: "textarea", label: "과제명", required: true }),
  field({ key: "mfds.approval", kind: "radio", options: ["needed", "not_needed"], required: true }),
  field({ key: "mfds.ind_no", required: true, show_when: [{ key: "mfds.approval", is: "needed" }] }),
  field({ key: "mfds.ind_file", kind: "file", supported: false, show_when: [{ key: "mfds.approval", is: "needed" }] }),
  field({ key: "phase", kind: "multi", options: ["1", "2"], types: ["drug"] }),
  field({ key: "disease.group", kind: "select", options: ["cancer", "brain"] }),
  field({
    key: "disease.subgroup", kind: "select", dynamic_options: true, code_prefix_of: "disease.group",
    code_prefixes: { cancer: "DCLA", brain: "DCLB" },
  }),
];
const FORM: PlanForm = {
  available: true,
  types: { drug: "Drug", other_research: "Other research" },
  pages: [
    { form: "new_review_part1", fields: FIELDS },
    { form: "new_review_part2", fields: [field({ key: "p2.note", label: "비고" })] },
  ],
};

describe("the form's own rules", () => {
  it("shows a field only for its project type and while its controlling answer holds", () => {
    const v = { "mfds.approval": "needed" };
    const ind = FIELDS[2];
    expect(isShown(ind, FIELDS, v, "other_research")).toBe(true);
    expect(isShown(ind, FIELDS, { "mfds.approval": "not_needed" }, "other_research")).toBe(false);
    expect(isShown(FIELDS[4], FIELDS, {}, "other_research")).toBe(false);
    expect(isShown(FIELDS[4], FIELDS, {}, "drug")).toBe(true);
  });

  it("saves only what is shown, filled in and writable: a hidden answer left behind is dropped", () => {
    const values = {
      "study.title_ko": "  제목 ", "mfds.approval": "not_needed", "mfds.ind_no": "IND-1", phase: ["1"],
      "mfds.ind_file": ["x.pdf"], "disease.group": "", "p2.note": "  ",
    };
    expect(valuesToSave(FORM, values, "other_research")).toEqual({
      "study.title_ko": "제목", "mfds.approval": "not_needed",
    });
  });

  it("unwraps agent-written values and gives the code prefix of the chosen group", () => {
    expect(unwrapValues({ a: { value: "x", source: "agent" }, b: ["y"], c: "z" })).toEqual({ a: "x", b: ["y"], c: "z" });
    expect(codePrefix(FIELDS[6], { "disease.group": "cancer" })).toBe("DCLA");
    expect(codePrefix(FIELDS[6], {})).toBeNull();
  });
});

const api = vi.hoisted(() => ({
  record: null as null | { id: string; version: number; project_key: string; affiliation: string; values: Record<string, unknown>; source: string; created_at: string },
  runs: [] as PlanRun[],
  saved: [] as Array<{ project_key: string; affiliation: string; values: Record<string, unknown> }>,
  problems: [] as string[],
  started: 0,
  released: 0,
  formCalls: 0,
}));

vi.mock("@/lib/api/new-plan", async () => {
  const real = await vi.importActual<typeof import("../src/lib/api/new-plan")>("../src/lib/api/new-plan");
  return {
    ...real,
    newPlanApi: {
      form: async () => ((api.formCalls += 1), FORM),
      values: async () => api.record,
      save: async (_id: number, body: { project_key: string; affiliation: string; values: Record<string, unknown> }) => {
        api.saved.push(body);
        api.record = { id: "r", version: api.saved.length, source: "form", created_at: "2026-11-23T00:00:00Z", ...body };
        return api.record;
      },
      check: async () => ({ ready: api.problems.length === 0, problems: api.problems }),
      start: async () => {
        api.started += 1;
        return api.runs[0];
      },
      runs: async () => api.runs,
      release: async () => {
        api.released += 1;
        api.runs = api.runs.map((r) => ({ ...r, draft_may_exist: false }));
        return { released: 1 };
      },
    },
  };
});

const run = (over: Partial<PlanRun>): PlanRun => ({
  id: "run-1", pipeline_step_id: 27, record_version: 1, status: "done", stage: "part2_saved", error: null,
  draft_title: "시험 과제", draft_may_exist: true, report: {}, created_at: "2026-11-23T01:00:00Z",
  started_at: null, finished_at: null, ...over,
});

function show(locale: "en" | "ko" = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ko}>
        <StepNewPlan stepId={27} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /new-plan draft/i }));
  await screen.findByLabelText(/과제명/);
  await screen.findByText(/^(No runs yet\.|Done|Failed)$/); // the runs are known: the start button is settled
}

beforeEach(() => {
  api.record = null;
  api.runs = [];
  api.saved = [];
  api.problems = [];
  api.started = 0;
  api.released = 0;
  api.formCalls = 0;
});
afterEach(cleanup);

describe("the new-plan panel", () => {
  it("makes no call until it is opened", () => {
    show();
    expect(api.formCalls).toBe(0);
    expect(screen.getByRole("button", { name: /new-plan draft/i })).toBeTruthy();
  });

  it("saves the values without a hidden answer and shows a conditional field only when asked for", async () => {
    show();
    await openPanel();
    expect(screen.queryByLabelText(/mfds.ind_no/)).toBeNull();
    fireEvent.click(screen.getByLabelText("needed"));
    expect(screen.getByLabelText(/mfds.ind_no/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/mfds.ind_no/), { target: { value: "IND-1" } });
    fireEvent.click(screen.getByLabelText("not_needed")); // changed back: the IND number must not be sent
    fireEvent.change(screen.getByLabelText(/과제명/), { target: { value: "제목" } });
    fireEvent.change(screen.getByLabelText(/Affiliation/), { target: { value: "미라" } });
    fireEvent.click(screen.getByRole("button", { name: "Save values" }));
    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]).toEqual({
      project_key: "other_research", affiliation: "미라",
      values: { "study.title_ko": "제목", "mfds.approval": "not_needed" },
    });
  });

  it("lists what is missing when checked and does not start the job", async () => {
    api.problems = ["pi.name: a value is needed"];
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Check/ }));
    expect(await screen.findByText("pi.name: a value is needed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start the job" }));
    await screen.findByText("pi.name: a value is needed");
    expect(api.started).toBe(0); // the server's reasons stop it before any run
  });

  it("asks before it starts, and starts once the values are complete", async () => {
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/real DRAFT/);
    expect(api.started).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Start the job" }));
    await waitFor(() => expect(api.started).toBe(1));
  });

  it("holds the step after a draft: no start button, and release needs a confirm", async () => {
    api.runs = [run({})];
    show();
    await openPanel();
    expect((screen.getByRole("button", { name: /Write the draft on R-BAY/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/R-BAY may hold a draft/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /I deleted the draft on R-BAY/ }));
    expect(api.released).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /The draft is deleted: release/ }));
    await waitFor(() => expect(api.released).toBe(1));
  });

  it("shows a failed run's reason and no release button when no draft is held", async () => {
    api.runs = [run({ status: "failed", stage: "form_opened", draft_may_exist: false, error: "Part I was not saved: pi.name" })];
    show();
    await openPanel();
    expect(await screen.findByText(/Part I was not saved: pi.name/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /I deleted the draft on R-BAY/ })).toBeNull();
  });

  it("has the same new-plan keys in both languages", () => {
    const keys = (o: unknown, p = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    const a = keys((en as { pipelines: { newPlan: unknown } }).pipelines.newPlan).sort();
    const b = keys((ko as { pipelines: { newPlan: unknown } }).pipelines.newPlan).sort();
    expect(b).toEqual(a);
  });
});
