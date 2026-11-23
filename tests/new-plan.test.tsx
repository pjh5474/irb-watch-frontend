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
  blockedOptions,
  cleanMulti,
  codePrefix,
  dependentList,
  isShown,
  pruneValues,
  unwrapValues,
  valuesToSave,
} from "../src/lib/api/new-plan";

function field(over: Partial<PlanField> & { key: string }): PlanField {
  return {
    kind: "text", label: over.key, basis: "optional", required: false, options: [], option_labels: null, note: "",
    show_when: [],
    types: null, multiple: false, max_length: null, numeric: false, dynamic_options: false, supported: true,
    code_prefix_of: null, code_prefixes: null, dependent_options: null, option_needs: {}, exclusive_groups: [],
    ...over,
  };
}

const FIELDS: PlanField[] = [
  field({ key: "study.title_ko", kind: "textarea", label: "과제명", required: true }),
  field({
    key: "mfds.approval", kind: "radio", options: ["needed", "not_needed"], required: true,
    option_labels: { needed: "필요", not_needed: "불필요" },
  }),
  field({ key: "mfds.ind_no", required: true, show_when: [{ key: "mfds.approval", is: "needed" }] }),
  field({ key: "mfds.ind_file", kind: "file", supported: false, show_when: [{ key: "mfds.approval", is: "needed" }] }),
  field({ key: "phase", kind: "multi", options: ["1", "2"], types: ["drug"] }),
  field({ key: "disease.group", kind: "select", options: ["cancer", "brain"] }),
  field({
    key: "disease.subgroup", kind: "select", dynamic_options: true, code_prefix_of: "disease.group",
    code_prefixes: { cancer: "DCLA", brain: "DCLB" },
    dependent_options: { cancer: { DCLA02: "소화기관", DCLA07: "유방" } }, // only 암 was read
  }),
  field({
    key: "classification.1", kind: "multi", options: ["drug", "digital_product", "digital_device"],
    show_when: [{ key: "classification.5", is_empty: true }],
    option_needs: { digital_device: "digital_product" },
    option_labels: { drug: "약물", digital_product: "디지털의료제품", digital_device: "디지털의료기기" },
  }),
  field({ key: "classification.5", kind: "multi", options: ["non_human"], option_labels: { non_human: "인간 대상 아님" } }),
  field({
    key: "research_cost.support_scope", kind: "multi", options: ["all", "part", "part_drug"],
    exclusive_groups: [["all"], ["part", "part_drug"]],
    option_labels: { all: "연구비 전액", part: "연구비 일부", part_drug: "연구비 일부(의약품)" },
  }),
];
const FORM: PlanForm = {
  available: true,
  types: { drug: "Drug", other_research: "Other research" },
  pages: [
    {
      form: "new_review_part1", fields: FIELDS,
      // two headings only: the other fields must still show (a heading list can miss one)
      sections: [{ title: "연구 과제명", keys: ["study.title_ko"] }, { title: "IND 관련", keys: ["mfds.approval", "mfds.ind_no"] }],
    },
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

  it("applies R-BAY's ticking rules: a child needs its parent, one exclusive group at a time", () => {
    const [cls1, , scope] = [FIELDS[7], FIELDS[8], FIELDS[9]];
    expect([...blockedOptions(cls1, [])]).toEqual(["digital_device"]);
    expect([...blockedOptions(cls1, ["digital_product"])]).toEqual([]);
    expect(cleanMulti(cls1, ["digital_device", "drug"])).toEqual(["drug"]); // no parent: the child goes
    expect(cleanMulti(cls1, ["digital_product", "digital_device"])).toEqual(["digital_product", "digital_device"]);
    expect([...blockedOptions(scope, ["all"])].sort()).toEqual(["part", "part_drug"]);
    expect([...blockedOptions(scope, ["part"])]).toEqual(["all"]);
    expect(cleanMulti(scope, ["all", "part"])).toEqual(["all"]);
  });

  it("clears 분류1 when 분류5 is ticked and keeps the dependent answers consistent", () => {
    const v = { "classification.1": ["drug"], "classification.5": ["non_human"], "disease.group": "cancer", "disease.subgroup": "DCLA07" };
    expect(pruneValues(FORM, v, "other_research")).toEqual({
      "classification.5": ["non_human"], "disease.group": "cancer", "disease.subgroup": "DCLA07",
    });
    // the group changes: a subgroup of the old group does not survive
    expect(pruneValues(FORM, { ...v, "classification.5": [], "disease.group": "brain" }, "other_research")).toEqual({
      "classification.1": ["drug"], "classification.5": [], "disease.group": "brain",
    });
    expect(dependentList(FIELDS[6], { "disease.group": "cancer" })).toEqual({ DCLA02: "소화기관", DCLA07: "유방" });
    expect(dependentList(FIELDS[6], { "disease.group": "brain" })).toBeNull(); // not read: the code is typed
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
  it("shows R-BAY's option text where it is known and the option key where it is not", async () => {
    show();
    await openPanel();
    expect(screen.getByLabelText("필요")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Project type/), { target: { value: "drug" } });
    expect(screen.getByLabelText("1")).toBeTruthy(); // the phase field has no labels: its keys show
  });

  it("groups Part I under R-BAY's headings and still shows a field no heading lists", async () => {
    show();
    await openPanel();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(["연구 과제명", "IND 관련"]); // a heading with no shown field is not drawn
    expect(headings).not.toContain("색인");
    expect(screen.getByLabelText(/disease.group/)).toBeTruthy(); // in no section: shown after the headings
    expect(screen.getByRole("group", { name: /mfds.approval/ })).toBeTruthy(); // a radio row is one named group
  });

  it("lets the user pick the disease subgroup by its Korean name and saves the R-BAY code", async () => {
    show();
    await openPanel();
    fireEvent.change(screen.getByLabelText(/disease.group/), { target: { value: "cancer" } });
    fireEvent.change(await screen.findByLabelText(/disease.subgroup/), { target: { value: "DCLA07" } });
    expect(screen.getByRole("option", { name: "유방" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/disease.group/), { target: { value: "brain" } }); // not read: a typed code
    expect((screen.getByLabelText(/disease.subgroup/) as HTMLInputElement).value).toBe(""); // the old answer went
    expect(screen.getByText(/starts with DCLB/)).toBeTruthy();
  });

  it("disables a child box until its parent is ticked, and hides 분류1 when 분류5 is ticked", async () => {
    show();
    await openPanel();
    const child = screen.getByLabelText("디지털의료기기") as HTMLInputElement;
    expect(child.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("디지털의료제품"));
    expect(child.disabled).toBe(false);
    fireEvent.click(child);
    fireEvent.click(screen.getByLabelText("디지털의료제품")); // untick the parent: the child goes with it
    expect(child.checked).toBe(false);
    fireEvent.click(screen.getByLabelText("연구비 전액")); // the exclusive groups
    expect((screen.getByLabelText("연구비 일부") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("연구비 전액"));
    expect((screen.getByLabelText("연구비 일부") as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("인간 대상 아님"));
    expect(screen.queryByLabelText("디지털의료제품")).toBeNull(); // 분류1 is gone
  });

  it("makes no call until it is opened", () => {
    show();
    expect(api.formCalls).toBe(0);
    expect(screen.getByRole("button", { name: /new-plan draft/i })).toBeTruthy();
  });

  it("saves the values without a hidden answer and shows a conditional field only when asked for", async () => {
    show();
    await openPanel();
    expect(screen.queryByLabelText(/mfds.ind_no/)).toBeNull();
    fireEvent.click(screen.getByLabelText("필요")); // R-BAY's own text; the stored value is the key
    expect(screen.getByLabelText(/mfds.ind_no/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/mfds.ind_no/), { target: { value: "IND-1" } });
    fireEvent.click(screen.getByLabelText("불필요")); // changed back: the IND number must not be sent
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
