import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    types: null, multiple: false, max_length: null, max_files: null, numeric: false, dynamic_options: false, supported: true,
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
  field({ key: "classification.5", kind: "multi", options: ["non_human"], option_labels: { non_human: "인간 대상 아님" } }),  field({
    key: "research_cost.support_scope", kind: "multi", options: ["all", "part", "part_drug"],
    exclusive_groups: [["all"], ["part", "part_drug"]],
    option_labels: { all: "연구비 전액", part: "연구비 일부", part_drug: "연구비 일부(의약품)" },
  }),
  // appended last: other tests pick fields by position
  field({ key: "attachments.main", kind: "file", multiple: true, max_files: 2 }),
  field({ key: "attachments.docs", kind: "docs" }),
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
    {
      form: "new_review_part2",
      fields: [
        field({ key: "p2.note", label: "비고" }),
        field({
          key: "p2.drug.rows", kind: "rows", label: "의약품 목록",
          rows: {
            max_rows: 2,
            fields: [
              { key: "name", kind: "text", label: "의약품명", required: true, options: [], option_labels: null },
              { key: "approved_use", kind: "radio", label: "허가 내 사용", required: false, options: ["yes", "no"], option_labels: { yes: "예", no: "아니오" } },
              { key: "ind_no", kind: "text", label: "IND No.", required: false, options: [], option_labels: null },
            ],
          },
        }),
      ],
    },
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

  it("saves 제출서류 rows trimmed and leaves out rows with no name", () => {
    const values = { "attachments.docs": [{ name: " Protocol ", version: " 1 ", date: "" }, { name: "  ", version: "9", date: "" }] };
    expect(valuesToSave(FORM, values, "other_research")).toEqual({
      "attachments.docs": [{ name: "Protocol", version: "1", date: "" }],
    });
    expect(valuesToSave(FORM, { "attachments.docs": [{ name: " ", version: "", date: "" }] }, "other_research")).toEqual({});
  });

  it("saves the drug and device rows trimmed, without nameless rows, empty boxes or more than the cap", () => {
    const values = {
      "p2.drug.rows": [
        { name: " A ", approved_use: "yes", ind_no: "  " },
        { name: " ", approved_use: "no" },
        { name: "B" }, { name: "C" },
      ],
    };
    expect(valuesToSave(FORM, values, "other_research")).toEqual({
      "p2.drug.rows": [{ name: "A", approved_use: "yes" }, { name: "B" }], // the cap of 2 rows
    });
    expect(valuesToSave(FORM, { "p2.drug.rows": [{ approved_use: "yes" }] }, "drug")).toEqual({});
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
  files: [] as Array<{ version_id: number; document_id: number; document_name: string; version_no: number; filename: string; size_bytes: number; created_at: string }>,
  started: 0,
  startedWith: [] as string[], // the manifest hash each start carried
  startRefusal: null as string | null, // a refusal the server gives to a start
  checkWithoutManifest: false, // an older server: ready, but no plan in the answer
  badManifest: false, // a plan this screen cannot read
  released: 0,
  formCalls: 0,
}));

vi.mock("@/lib/api/new-plan", async () => {
  const real = await vi.importActual<typeof import("../src/lib/api/new-plan")>("../src/lib/api/new-plan");
  const { ApiError } = await vi.importActual<typeof import("../src/lib/api/client")>("../src/lib/api/client");
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
      // like the server: when nothing stops the run, the manifest of what it would do (never the values) and its hash
      check: async () => {
        if (api.problems.length > 0) return { ready: false, problems: api.problems, manifest: null, manifest_sha256: null };
        if (api.checkWithoutManifest) return { ready: true, problems: [] };
        if (api.badManifest) return { ready: true, problems: [], manifest: { scope: [] }, manifest_sha256: "a".repeat(64) };
        const ids = (api.record?.values["attachments.main"] as string[] | undefined) ?? [];
        return {
          ready: true,
          problems: [],
          manifest: {
            identity: {
              step_id: 27, hospital_id: 1, agency: "HOSP", project_key: api.record?.project_key ?? "other_research",
              affiliation: api.record?.affiliation ?? "", pi_name: "Dr Test",
            },
            record: { id: "r", version: api.record?.version ?? 1 },
            files: api.files
              .filter((f) => ids.includes(String(f.version_id)))
              .map((f) => ({ field: "attachments.main", version_id: f.version_id, filename: f.filename, sha256: "0".repeat(64), size_bytes: f.size_bytes })),
            scope: ["open_form", "create_draft", "fill_part1", "press_next", "fill_part2", "press_save"],
            forbidden: ["submit_application"],
          },
          manifest_sha256: `${api.record?.version ?? 1}`.padStart(64, "a"),
        };
      },
      start: async (_id: number, sha: string) => {
        api.started += 1;
        api.startedWith.push(sha);
        if (api.startRefusal) throw new ApiError(409, api.startRefusal); // like the server's 409 with its reason
        return api.runs[0];
      },
      runs: async () => api.runs,
      files: async () => api.files,
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
  api.startedWith = [];
  api.startRefusal = null;
  api.checkWithoutManifest = false;
  api.badManifest = false;
  api.files = [];
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

  const stepFile = (id: number, filename: string, version_no = 1) => ({
    version_id: id, document_id: id, document_name: "Protocol", version_no, filename, size_bytes: 2048,
    created_at: "2026-11-23T00:00:00Z",
  });

  it("picks the step's own files by version id, adds 제출서류 rows from their names and saves both", async () => {
    api.files = [stepFile(101, "protocol v2.pdf"), stepFile(102, "ICF.docx"), stepFile(103, "extra.pdf")];
    show();
    await openPanel();
    fireEvent.click(await screen.findByLabelText(/protocol v2.pdf/));
    fireEvent.click(screen.getByLabelText(/ICF.docx/));
    expect((screen.getByLabelText(/extra.pdf/) as HTMLInputElement).disabled).toBe(true); // the form takes 2
    fireEvent.click(screen.getByRole("button", { name: /Add a row for each attached file \(2\)/ }));
    fireEvent.change(screen.getByLabelText("Document 1: version"), { target: { value: "2.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a document" })); // an empty row is not saved
    fireEvent.change(screen.getByLabelText("Document 1: date"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save values" }));
    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0].values).toEqual({
      "attachments.main": ["101", "102"],
      "attachments.docs": [
        { name: "protocol v2", version: "2.0", date: "2026-11-01" },
        { name: "ICF", version: "", date: "" },
      ],
    });
  });

  it("lets a single-file box take one file only and saves its version id", async () => {
    api.files = [stepFile(101, "reason.pdf"), stepFile(102, "other.pdf")];
    const extra = field({ key: "p2.reason_file", kind: "file", label: "근거문서", multiple: false });
    const files = FORM.pages[1].fields;
    files.push(extra); // only this test sees the box (the other tests find files by their names)
    try {
      show();
      await openPanel();
      const box = (await screen.findAllByRole("group", { name: /근거문서/ }))[0];
      fireEvent.click(within(box).getByLabelText(/reason.pdf/));
      expect((within(box).getByLabelText(/other.pdf/) as HTMLInputElement).disabled).toBe(true); // the box takes one
      fireEvent.click(screen.getByRole("button", { name: "Save values" }));
      await waitFor(() => expect(api.saved).toHaveLength(1));
      expect(api.saved[0].values["p2.reason_file"]).toEqual(["101"]);
    } finally {
      files.splice(files.indexOf(extra), 1);
    }
  });

  it("edits a drug row (boxes and a yes/no choice), caps the rows and saves them", async () => {
    show();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Add a row" }));
    fireEvent.change(screen.getByLabelText("Row 1: 의약품명"), { target: { value: " [TEST] drug " } });
    fireEvent.click(within(screen.getByRole("group", { name: "Row 1: 허가 내 사용" })).getByLabelText("아니오"));
    expect(screen.getByText(/check it fits this study/)).toBeTruthy(); // a drug row on a non-drug study: a gentle note
    fireEvent.click(screen.getByRole("button", { name: "Add a row" }));
    expect((screen.getByRole("button", { name: "Add a row" }) as HTMLButtonElement).disabled).toBe(true); // the cap is 2
    fireEvent.click(screen.getByRole("button", { name: "Save values" }));
    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0].values["p2.drug.rows"]).toEqual([{ name: "[TEST] drug", approved_use: "no" }]); // the empty row is left out
  });

  it("names the files and says an upload cannot be undone before the job starts", async () => {
    api.files = [stepFile(101, "protocol.pdf")];
    api.record = {
      id: "r", version: 1, project_key: "other_research", affiliation: "A", source: "form", created_at: "2026-11-23T00:00:00Z",
      values: { "attachments.main": ["101"] },
    };
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    const dialog = await screen.findByRole("alertdialog"); // after the check: the dialog shows the server's plan
    expect(dialog.textContent).toMatch(/cannot be taken back/);
    expect(dialog.textContent).toMatch(/protocol\.pdf/);
  });

  it("says so when the step has no files, and an unsupported file field stays a note", async () => {
    show();
    await openPanel();
    expect(await screen.findByText(/no files yet/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("필요")); // opens mfds.ind_file, which the job does not upload
    expect(screen.getAllByText(/not written by this job yet/).length).toBeGreaterThan(0);
  });

  it("lists what is missing when checked and does not start the job", async () => {
    api.problems = ["pi.name: a value is needed"];
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Check/ }));
    expect(await screen.findByText("pi.name: a value is needed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    await screen.findByText("pi.name: a value is needed");
    expect(screen.queryByRole("alertdialog")).toBeNull(); // no plan to approve: the reasons are shown instead
    expect(api.started).toBe(0); // the server's reasons stop it before any run
  });

  it("shows the server's plan, asks before it starts, and sends the hash of exactly that plan", async () => {
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/real DRAFT/);
    expect(dialog.textContent).toMatch(/PI Dr Test/); // identity and scope come from the manifest
    expect(dialog.textContent).toMatch(/Create a draft application on R-BAY/);
    expect(dialog.textContent).toMatch(/Never done: submitting the application/);
    expect(api.started).toBe(0); // the check sent nothing
    fireEvent.click(screen.getByRole("button", { name: "Start the job" }));
    await waitFor(() => expect(api.started).toBe(1));
    expect(api.startedWith).toEqual(["a".repeat(63) + "1"]); // the hash of the version-1 plan that was shown
  });

  it("a refused start shows the reason and needs a new check before another start", async () => {
    api.startRefusal = "what you approved is not what would be written now: check the plan again";
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start the job" }));
    expect(await screen.findByText(/not what would be written now/)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull(); // the approval was spent: no stale plan stays on screen
  });

  it("fails closed when the server answers ready without a valid plan: no dialog, no start, a clear message", async () => {
    api.checkWithoutManifest = true; // an older server: "ready" and nothing to approve
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    expect(await screen.findByText(/did not return the plan to approve/)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.started).toBe(0); // and no legacy start without a hash
    expect(api.startedWith).toEqual([]);
    api.checkWithoutManifest = false;
    api.badManifest = true; // a manifest that is not what this screen understands
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    expect(await screen.findByText(/did not return the plan to approve/)).toBeTruthy();
    expect(api.started).toBe(0);
  });

  it("an edit after the plan was shown withdraws it", async () => {
    show();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Write the draft on R-BAY/ }));
    await screen.findByRole("alertdialog");
    fireEvent.change(screen.getByLabelText(/과제명/), { target: { value: "다른 제목" } });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.started).toBe(0);
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
