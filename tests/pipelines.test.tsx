import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { PipelineView } from "../src/components/pipelines/pipeline-view";
import { ProjectPipelines } from "../src/components/pipelines/project-pipelines";
import { StepPageView } from "../src/components/pipelines/step/step-page";
import { ApiError } from "../src/lib/api/client";
import {
  daysUntil,
  sizeLabel,
  todaySeoul,
  type PipelineDetail,
  type PipelineStep,
  type PipelineSummary,
  type StepPage,
} from "../src/lib/api/pipelines";

const SUMMARY: PipelineSummary = {
  id: 9,
  project_id: 1,
  hospital_id: 4,
  hospital_name: "SNUH",
  in_project: true,
  steps: 2,
  closed_steps: 1,
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  deleted_at: null,
};

const STATUSES = [
  { key: "not_started", label: "Not started", closed: false, archived: false },
  { key: "submitted", label: "Submitted", closed: false, archived: false },
  { key: "approved", label: "Approved", closed: true, archived: false },
  { key: "old", label: "Old", closed: false, archived: true },
];

const INITIAL: PipelineStep = {
  id: 21,
  step_type_id: 1,
  step_type_name: "Initial review",
  name: "Initial review",
  position: 1,
  status_key: "not_started",
  due_on: "2020-01-01",
  submitted_on: null,
  decided_on: null,
  note: "",
  deleted_at: null,
};

const MEETING: PipelineStep = {
  id: 22,
  step_type_id: null,
  step_type_name: null,
  name: "Meeting",
  position: 2,
  status_key: "approved",
  due_on: "2020-01-01",
  submitted_on: null,
  decided_on: "2026-11-11",
  note: "",
  deleted_at: null,
};

const DETAIL: PipelineDetail = {
  pipeline: SUMMARY,
  access: "owner",
  statuses: STATUSES,
  step_types: [{ id: 2, name: "Amendment", description: "" }],
  steps: [
    { ...INITIAL, documents: 1, required: 2, required_missing: 1, drafts: 1, open_jobs: 0 },
    { ...MEETING, documents: 0, required: 0, required_missing: 0, drafts: 0, open_jobs: 1 },
    { ...MEETING, id: 23, name: "Old step", deleted_at: "2026-11-12T00:00:00Z", documents: 0, required: 0, required_missing: 0, drafts: 0, open_jobs: 0 },
  ],
};

const PAGE: StepPage = {
  pipeline: SUMMARY,
  access: "owner",
  shared: false,
  step: INITIAL,
  statuses: STATUSES,
  checklist: [
    { name: "Protocol", done: true, status: "final", document_id: 31 },
    { name: "Consent", done: false, status: "needed", document_id: 32 },
  ],
  documents: [
    {
      id: 31,
      name: "Protocol",
      created_at: "2026-11-11T00:00:00Z",
      deleted_at: null,
      listed: true,
      section: "submission",
      required: true,
      status: "final",
      versions: [
        { version_no: 2, filename: "p2.docx", size_bytes: 12_000, has_text: true, text_note: null, created_at: "2026-11-12T00:00:00Z" },
        { version_no: 1, filename: "p1.docx", size_bytes: 11_000, has_text: true, text_note: null, created_at: "2026-11-11T00:00:00Z" },
      ],
    },
    { id: 32, name: "Consent", created_at: "2026-11-11T00:00:00Z", deleted_at: null, listed: true, section: "submission", required: true, status: "needed", versions: [] },
    { id: 33, name: "신청서", created_at: "2026-11-11T00:00:00Z", deleted_at: null, listed: true, section: "application", required: false, status: "in_progress", versions: [
      { version_no: 1, filename: "a.hwp", size_bytes: 3_000, has_text: true, text_note: null, created_at: "2026-11-11T00:00:00Z" },
    ] },
  ],
  drafts: [],
  jobs: [],
  previous_step_id: null,
  next_step_id: 22,
};

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  list: [] as unknown[],
  startError: null as unknown,
  pushed: [] as string[],
  drafts: [] as unknown[],
  jobs: [] as unknown[],
  boards: [] as unknown[],
  inputs: null as unknown,
  page: {} as Record<string, unknown>, // overrides of the step page
  sites: [] as unknown[],
  detail: null as unknown, // replaces the overview when set (phase B2b tests)
  hospital: null as unknown,
  copyTargets: [] as unknown[],
  copyResult: [] as unknown[],
  copyError: null as unknown,
}));

vi.mock("@/lib/api/sites", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/sites")>("../src/lib/api/sites");
  return {
    ...actual,
    siteApi: {
      list: async () => state.sites,
      create: async (projectId: number, body: unknown) => {
        state.calls.push(["createSite", projectId, body]);
        return {};
      },
      remove: async () => ({}),
      restore: async () => ({}),
      facts: async () => ({ site: state.sites[0], facts: [], suggested: [] }),
    },
  };
});

const JOB = (status: string, extra: object = {}) => ({
  id: "job-1",
  kind: "draft",
  status,
  error: null,
  draft_id: null,
  pipeline_step_id: 21,
  created_at: "2026-11-12T01:00:00Z",
  finished_at: null,
  ...extra,
});

const INPUTS = {
  step_id: 21,
  step_name: "Initial review",
  hospital_id: 4,
  files: [
    { document_id: 31, name: "Protocol", step_id: 21, step_name: "Initial review", version_no: 2, filename: "p2.docx", has_text: true, text_note: null, ticked: true },
    { document_id: 32, name: "Scan", step_id: 21, step_name: "Initial review", version_no: 1, filename: "scan.bin", has_text: false, text_note: "this file type has no readable text", ticked: false },
  ],
  allow_board_documents: false,
  guide_ids: [],
  form_template_id: 20,
  has_instructions: true,
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
  useRouter: () => ({ push: (href: string) => state.pushed.push(href), refresh: () => {} }),
  usePathname: () => "/projects/1",
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    toUpload: async (file: File) => ({ filename: file.name, content_base64: "eA==" }),
    docgenApi: {
      jobs: async () => state.jobs,
      startStepDraft: async (stepId: number, body: unknown) => {
        if (state.startError) throw state.startError;
        state.calls.push(["startStepDraft", stepId, body]);
        state.jobs = [JOB("queued")];
        return state.jobs[0];
      },
    },
  };
});

// The hospital's boards the user can read (the real one asks Supabase).
vi.mock("@/lib/draft-picker", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/draft-picker")>("../src/lib/draft-picker");
  return { ...actual, pickerSourcesOfHospital: async () => state.boards, pickerDocuments: async () => ({ documents: [], more: false }) };
});

vi.mock("@/lib/api/pipelines", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/pipelines")>("../src/lib/api/pipelines");
  const call = (name: string) => async (...args: unknown[]) => {
    state.calls.push([name, ...args]);
    return {};
  };
  return {
    ...actual,
    pipelineApi: {
      list: async () => state.list,
      start: async (projectId: number, target: unknown) => {
        if (state.startError) throw state.startError;
        state.calls.push(["start", projectId, target]);
        return { id: 77 };
      },
      get: async () => state.detail ?? DETAIL,
      hospital: async () => state.hospital,
      getStep: async () => ({ ...PAGE, drafts: state.drafts, jobs: state.jobs, ...state.page }),
      history: async (id: number, stepId?: number) => {
        state.calls.push(["history", id, stepId]);
        return [
          { id: 1, step_id: 21, mine: true, event_type: "document.uploaded", payload: { name: "Protocol" }, created_at: "2026-11-11T01:02:00Z" },
        ];
      },
      restore: call("restore"),
      remove: call("remove"),
      addStep: call("addStep"),
      updateStep: call("updateStep"),
      reorder: call("reorder"),
      removeStep: call("removeStep"),
      restoreStep: call("restoreStep"),
      setDocumentRemoved: call("setDocumentRemoved"),
      downloadUrl: async () => ({ url: "https://files.example/x" }),
      draftInputs: async () => state.inputs,
      upload: async (id: number, stepId: number, name: string, file: { filename: string }, documentId?: number) => {
        state.calls.push(["upload", id, stepId, name, file.filename, documentId]);
        return { document: { name }, version_no: 3 };
      },
      addDocument: call("addDocument"),
      updateDocument: call("updateDocument"),
      reorderDocuments: call("reorderDocuments"),
      copyTargets: async (id: number, stepId: number) => {
        state.calls.push(["copyTargets", id, stepId]);
        return state.copyTargets;
      },
      copyStep: async (id: number, stepId: number, siteIds: number[]) => {
        state.calls.push(["copyStep", id, stepId, siteIds]);
        if (state.copyError) throw state.copyError;
        return state.copyResult;
      },
    },
  };
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

beforeEach(() => {
  state.calls = [];
  state.list = [];
  state.startError = null;
  state.pushed = [];
  state.drafts = [];
  state.jobs = [];
  state.boards = [];
  state.inputs = INPUTS;
  state.page = {};
  state.sites = [];
  state.detail = null;
  state.hospital = null;
  state.copyTargets = [];
  state.copyResult = [];
  state.copyError = null;
});

afterEach(cleanup);

describe("copy a step to other PIs (phase C2)", () => {
  const target = (extra: object) => ({
    site_id: 1001, site_no: "02", pi_name: "Lee", pipeline_id: 12, action: "fill", reason: null,
    step_id: 40, step_label: "Initial review", notes: [], ...extra,
  });

  it("stays closed until asked, then previews and copies to the ticked sites", async () => {
    state.copyTargets = [
      target({}),
      target({ site_id: 1002, site_no: "03", pi_name: "Park", pipeline_id: 13, action: "add", step_id: null, step_label: "2차 Initial review", notes: ["meeting_not_copied"] }),
      target({ site_id: 1003, site_no: "04", pi_name: "Choi", pipeline_id: null, action: "skip", reason: "no_pipeline", step_id: null }),
    ];
    state.copyResult = [target({}), target({ site_id: 1002, site_no: "03", pi_name: "Park", pipeline_id: 13, action: "add", step_id: 77, step_label: "2차 Initial review" })];
    wrap(<StepPageView id={9} stepId={21} />);
    const open = await screen.findByRole("button", { name: "Copy to other PIs…" });
    expect(state.calls.some((c) => (c as unknown[])[0] === "copyTargets")).toBe(false); // no extra call on load
    fireEvent.click(open);
    const box = within(await screen.findByRole("region", { name: "Copy this step to other PIs of this hospital" }));
    await box.findByText("— fills its Initial review (empty fields only)");
    expect(box.getByText("— adds 2차 Initial review")).toBeTruthy();
    expect(box.getByText("(the target meeting is no longer valid and is not copied)")).toBeTruthy();
    const skipped = box.getByRole("checkbox", { name: /04 · PI Choi/ }) as HTMLInputElement;
    expect(skipped.disabled).toBe(true);
    expect(box.getByText("— no pipeline yet: start it first")).toBeTruthy();
    fireEvent.click(box.getByRole("checkbox", { name: /02 · PI Lee/ })); // untick one
    fireEvent.click(box.getByRole("checkbox", { name: /02 · PI Lee/ })); // and tick it again
    fireEvent.click(box.getByRole("button", { name: "Copy to 2 sites" }));
    await vi.waitFor(() => expect(state.calls).toContainEqual(["copyStep", 9, 21, [1001, 1002]]));
    expect(await box.findByText("Copied to 2 sites.")).toBeTruthy();
    const result = within(box.getByRole("list", { name: "Copy result" }));
    expect(result.getByRole("link", { name: "2차 Initial review added" }).getAttribute("href")).toBe("/pipelines/13/steps/77");
    expect(result.getByRole("link", { name: "Initial review filled" }).getAttribute("href")).toBe("/pipelines/12/steps/40");
  });

  it("shows the server's reason when nothing could be copied", async () => {
    state.copyTargets = [target({})];
    state.copyError = new ApiError(409, "nothing was copied: 02 · PI Lee: already has a copy of this step");
    wrap(<StepPageView id={9} stepId={21} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy to other PIs…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy to 1 site" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already has a copy");
  });

  it("says when the hospital has no other PI, and is not offered on follow-ups or read-only pages", async () => {
    wrap(<StepPageView id={9} stepId={21} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy to other PIs…" }));
    expect(await screen.findByText("This hospital has no other PI in this project.")).toBeTruthy();
    cleanup();
    state.page = { access: "read" };
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByText("You can read this pipeline but not change it (support access).");
    expect(screen.queryByRole("button", { name: "Copy to other PIs…" })).toBeNull();
  });

  it("offers the R-BAY new-plan panel only on an initial-review step the user owns", async () => {
    const button = { name: "Write the R-BAY new-plan draft…" };
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByRole("button", { name: "Copy to other PIs…" });
    expect(screen.queryByRole("button", button)).toBeNull(); // no category: not offered
    cleanup();
    state.page = { step_type_category: "amendment" };
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByRole("button", { name: "Copy to other PIs…" });
    expect(screen.queryByRole("button", button)).toBeNull();
    cleanup();
    state.page = { step_type_category: "initial" };
    wrap(<StepPageView id={9} stepId={21} />);
    expect(await screen.findByRole("button", button)).toBeTruthy();
    cleanup();
    state.page = { step_type_category: "initial", access: "edit" }; // a member: the server refuses them
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByRole("button", { name: "Copy to other PIs…" });
    expect(screen.queryByRole("button", button)).toBeNull();
  });

  it("links a copied step to the step it came from", async () => {
    state.page = { copied_from: { pipeline_id: 8, step_id: 5, step_label: "Initial review", site_label: "01 · PI Kim", removed: true } };
    wrap(<StepPageView id={9} stepId={21} />);
    const link = await screen.findByRole("link", { name: "Initial review" });
    expect(link.getAttribute("href")).toBe("/pipelines/8/steps/5");
    expect(link.parentElement?.textContent).toBe("Copied from: 01 · PI Kim · Initial review (removed)");
  });
});

describe("steps (phase B2b): follow-ups, numbers, subject, IRB result, hospital page", () => {
  const RESULTS = [
    { key: "approved", label: "Approved", approved: true, needs_answer: false, archived: false },
    { key: "administrative_revision", label: "Admin revision", approved: false, needs_answer: true, archived: false },
    { key: "gone", label: "Gone", approved: false, needs_answer: false, archived: true },
  ];
  const ANSWER: PipelineStep = {
    ...INITIAL, id: 24, step_type_id: 7, step_type_name: "Answer", name: "Answer", position: 5,
    parent_step_id: 21, sequence_no: 1, label: "1차 Answer", subject: "first round",
  };
  const row = { documents: 0, required: 0, required_missing: 0, drafts: 0, open_jobs: 0 };

  it("shows follow-ups indented under their main step and moves them with it", async () => {
    state.detail = {
      ...DETAIL,
      results: RESULTS,
      steps: [
        { ...INITIAL, ...row, result_key: "administrative_revision", subject: "PT 2.0" },
        { ...ANSWER, ...row },
        { ...MEETING, ...row },
      ],
    };
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("01-1")).toBeTruthy();
    expect(screen.getByText("02")).toBeTruthy();
    const answers = screen.getByRole("list", { name: "Follow-up steps of Initial review" });
    expect(within(answers).getByRole("link", { name: "1차 Answer" }).getAttribute("href")).toBe("/pipelines/9/steps/24");
    expect(screen.getByText("(PT 2.0)")).toBeTruthy();
    expect(screen.getByText("Admin revision")).toBeTruthy(); // the IRB result
    expect(screen.queryByRole("button", { name: "Move 1차 Answer up" })).toBeNull(); // follow-ups do not move alone
    fireEvent.click(screen.getByRole("button", { name: "Move Meeting up" }));
    await vi.waitFor(() => expect(state.calls).toEqual([["reorder", 9, [22, 21, 24]]]));
  });

  it("keeps follow-up types out of the add-step list", async () => {
    state.detail = { ...DETAIL, step_types: [{ id: 2, name: "Amendment", description: "" }, { id: 7, name: "Answer", description: "", category: "follow_up" }] };
    wrap(<PipelineView id={9} />);
    const select = (await screen.findByLabelText("Step type")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Free step (no type)", "Amendment"]);
  });

  it("sets the IRB result, offers the matching status and highlights the follow-up", async () => {
    state.page = {
      step: { ...INITIAL, result_key: "administrative_revision", sequence_no: null, label: "Initial review" },
      results: RESULTS,
      suggested_status: "submitted",
      needs_answer: true,
      follow_ups: [ANSWER],
      follow_up_types: [{ id: 7, name: "Answer", description: "", category: "follow_up" }],
    };
    wrap(<StepPageView id={9} stepId={21} />);
    const result = (await screen.findByLabelText("IRB result")) as HTMLSelectElement;
    expect([...result.options].map((o) => o.textContent)).toEqual(["No result yet", "Approved", "Admin revision"]); // archived left out
    fireEvent.change(result, { target: { value: "approved" } });
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { result_key: "approved" }]));
    const offer = screen.getByRole("button", { name: "Set status to Submitted" }) as HTMLButtonElement;
    await vi.waitFor(() => expect(offer.disabled).toBe(false)); // one change at a time
    fireEvent.click(offer);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { status_key: "submitted" }]));

    const follow = within(screen.getByRole("region", { name: "Follow-up steps" }));
    expect(follow.getByText(/The IRB asked for an answer/)).toBeTruthy();
    expect(follow.getByRole("link", { name: "1차 Answer" })).toBeTruthy();
    fireEvent.change(follow.getByLabelText("Subject (optional)"), { target: { value: " 2nd " } });
    fireEvent.click(follow.getByRole("button", { name: "Add follow-up step" }));
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual(["addStep", 9, { step_type_id: 7, name: null, parent_step_id: 21, subject: "2nd" }]),
    );
  });

  it("edits the round number and the subject", async () => {
    state.page = { step: { ...INITIAL, sequence_no: 2, label: "2차 Initial review", subject: "" }, results: RESULTS };
    wrap(<StepPageView id={9} stepId={21} />);
    const number = await screen.findByLabelText("Round number");
    const status = screen.getByLabelText("Status") as HTMLSelectElement; // never disabled by a save (auto-save)
    const idle = () => vi.waitFor(() => expect(status.disabled).toBe(false));
    fireEvent.change(number, { target: { value: "3" } });
    fireEvent.blur(number);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { sequence_no: 3 }]));
    await idle();
    fireEvent.change(number, { target: { value: "1000" } });
    fireEvent.blur(number);
    expect((await screen.findByRole("alert")).textContent).toBe("The number must be 1 to 999, or empty.");
    fireEvent.change(number, { target: { value: "" } });
    fireEvent.blur(number);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { sequence_no: null }]));
    await idle();
    const subject = screen.getByLabelText("Subject");
    fireEvent.change(subject, { target: { value: " PT 2.0 " } });
    fireEvent.blur(subject);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateStep", 9, 21, { subject: "PT 2.0" }]));
  });

  it("a follow-up names the step it answers and has no follow-ups of its own", async () => {
    state.page = { step: ANSWER, parent: { ...INITIAL, label: "Initial review" }, results: RESULTS };
    wrap(<StepPageView id={9} stepId={24} />);
    await screen.findByText("Answer to:");
    expect(screen.getAllByRole("link", { name: "Initial review" })[0].getAttribute("href")).toBe("/pipelines/9/steps/21");
    expect(screen.queryByRole("region", { name: "Follow-up steps" })).toBeNull();
  });

  it("the project page links the hospital page when a hospital has two or more PIs", async () => {
    const SITE = { id: 30, project_id: 1, hospital_id: 4, site_no: "01", pi_name: "Kim", note: "", created_at: "", updated_at: "", deleted_at: null };
    state.sites = [SITE, { ...SITE, id: 31, site_no: "02", pi_name: "Lee" }, { ...SITE, id: 32, hospital_id: 5 }];
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 4, name: "SNUH" }, { id: 5, name: "Ewha" }]} />);
    const links = await screen.findAllByRole("link", { name: "Compare PIs" });
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/projects/1/hospitals/4"]);
  });
});

describe("HospitalView", () => {
  const step = (id: number, extra: object) => ({
    id, step_type_id: 1, name: "Initial", label: "Initial", sequence_no: null, subject: "", status_key: "not_started",
    result_key: null, due_on: null, submitted_on: null, decided_on: null, follow_ups: 0, ...extra,
  });

  it("lines up the sites of a hospital, one row per step type and round", async () => {
    state.hospital = {
      project_id: 1, hospital_id: 4, hospital_name: "SNUH", access: "owner",
      statuses: STATUSES,
      results: [{ key: "approved", label: "Approved", approved: true, needs_answer: false, archived: false }],
      step_types: [],
      sites: [
        {
          site_id: 30, site_no: "01", pi_name: "Kim", pipeline_id: 9,
          steps: [
            step(1, { status_key: "approved", result_key: "approved", decided_on: "2026-11-01", follow_ups: 2 }),
            step(2, { step_type_id: 2, name: "Amendment", label: "1차 Amendment", sequence_no: 1, subject: "PT 2.0" }),
          ],
        },
        { site_id: 31, site_no: "02", pi_name: "Lee", pipeline_id: 10, steps: [step(3, {})] },
        { site_id: 32, site_no: "", pi_name: "Park", pipeline_id: null, steps: [] },
      ],
    };
    const { HospitalView } = await import("../src/components/pipelines/hospital-view");
    wrap(<HospitalView projectId={1} hospitalId={4} />);
    await screen.findByRole("heading", { name: "SNUH: PIs side by side" });
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["", "01 · PI Kim", "02 · PI Lee", "PI ParkNo pipeline yet"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Initial", "1차 Amendment"]);
    const first = within(rows[0]);
    expect(first.getByRole("link", { name: "Approved" }).getAttribute("href")).toBe("/pipelines/9/steps/1");
    expect(first.getByText("2 follow-ups")).toBeTruthy();
    expect(first.getByText("IRB meeting date 2026-11-01")).toBeTruthy();
    expect(within(rows[1]).getByText("PT 2.0")).toBeTruthy();
    expect(within(rows[1]).getAllByText("—")).toHaveLength(2); // Lee and Park have no amendment
  });

  it("shows the server's reason when the page cannot be read", async () => {
    const { pipelineApi } = await import("../src/lib/api/pipelines");
    const spy = vi.spyOn(pipelineApi, "hospital").mockRejectedValue(new ApiError(404, "project not found"));
    const { HospitalView } = await import("../src/components/pipelines/hospital-view");
    wrap(<HospitalView projectId={1} hospitalId={4} />);
    expect((await screen.findByRole("alert")).textContent).toBe("project not found");
    spy.mockRestore();
  });
});

describe("helpers", () => {
  it("labels sizes, counts days and knows Seoul's date", () => {
    expect(sizeLabel(512)).toBe("512 B");
    expect(sizeLabel(12_400)).toBe("12 KB");
    expect(sizeLabel(3_400_000)).toBe("3.4 MB");
    expect(daysUntil("2026-11-30", "2026-11-20")).toBe(10);
    expect(daysUntil("2026-11-19", "2026-11-20")).toBe(-1);
    expect(todaySeoul(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-21");
  });
});

describe("ProjectPipelines (sites per PI)", () => {
  const SITE = { id: 30, project_id: 1, hospital_id: 4, site_no: "01", pi_name: "Kim", note: "", created_at: "", updated_at: "", deleted_at: null };

  it("groups sites by hospital: a site's pipeline opens, a hospital without sites starts in one click", async () => {
    state.list = [{ ...SUMMARY, site_id: 30, pi_name: "Kim", site_no: "01" }];
    state.sites = [SITE, { ...SITE, id: 31, site_no: "02", pi_name: "Lee" }];
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 4, name: "SNUH" }, { id: 5, name: "Ewha" }]} />);
    expect(await screen.findByText("01 · PI Kim")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/pipelines/9");
    expect(screen.getByText("1 of 2 steps finished")).toBeTruthy();
    // Lee's site has no pipeline yet; Ewha has no site: one click makes its unnamed site.
    const starts = screen.getAllByRole("button", { name: "Start IRB pipeline" });
    expect(starts).toHaveLength(2);
    fireEvent.click(starts[0]);
    await vi.waitFor(() => expect(state.pushed).toEqual(["/pipelines/77"]));
    expect(state.calls).toEqual([["start", 1, { site_id: 31 }]]);
    fireEvent.click(screen.getAllByRole("button", { name: "Start IRB pipeline" })[1]);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["start", 1, { hospital_id: 5 }]));
  });

  it("adds a PI to a hospital", async () => {
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 4, name: "SNUH" }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a PI" }));
    const form = within(screen.getByRole("form", { name: "Add a PI" }));
    fireEvent.change(form.getByLabelText("PI name"), { target: { value: " Park " } });
    fireEvent.change(form.getByLabelText("Site number"), { target: { value: "03" } });
    fireEvent.click(form.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(state.calls).toEqual([["createSite", 1, { hospital_id: 4, pi_name: "Park", site_no: "03" }]]));
  });

  it("shows the server's reason when starting fails", async () => {
    state.startError = new ApiError(409, "this hospital has PIs; start the pipeline of a PI's site");
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 5, name: "Ewha" }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start IRB pipeline" }));
    expect((await screen.findByRole("alert")).textContent).toContain("has PIs");
  });

  it("lists pipelines of hospitals no longer in the project", async () => {
    state.list = [{ ...SUMMARY, in_project: false }];
    wrap(<ProjectPipelines projectId={1} hospitals={[]} />);
    await screen.findByText("Hospitals no longer in this project");
    expect(screen.getByText("SNUH")).toBeTruthy();
  });
});

describe("PipelineView (overview)", () => {
  const overview = async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
  };
  const row = (name: string) => within(screen.getByRole("link", { name }).closest("li") as HTMLElement);

  it("lists each step with a link to its page, its status and counts, and no uploads or drafts", async () => {
    await overview();
    expect(screen.getByRole("link", { name: "Initial review" }).getAttribute("href")).toBe("/pipelines/9/steps/21");
    const initial = row("Initial review");
    expect(initial.getByText("Not started")).toBeTruthy();
    expect(initial.getByText("1 document")).toBeTruthy();
    expect(initial.getByText("1 of 2 required")).toBeTruthy();
    expect(initial.getByText("1 AI draft")).toBeTruthy();
    expect(initial.getByText(/overdue/)).toBeTruthy(); // open step past its due date
    const meeting = row("Meeting");
    expect(meeting.queryByText(/overdue/)).toBeNull(); // closed steps are never overdue
    expect(meeting.getByText("no documents")).toBeTruthy();
    expect(meeting.getByText("AI draft being written")).toBeTruthy();
    expect(meeting.getByText("IRB meeting date 2026-11-11")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Draft for this step" })).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
  });

  it("reorders steps", async () => {
    await overview();
    fireEvent.click(screen.getByRole("button", { name: "Move Meeting up" }));
    await vi.waitFor(() => expect(state.calls).toEqual([["reorder", 9, [22, 21]]]));
  });

  it("adds a typed step", async () => {
    await overview();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Choose a step type or enter a name.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Step type"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Step added.");
    expect(state.calls).toEqual([["addStep", 9, { step_type_id: 2, name: null, subject: "" }]]);
  });

  it("links removed steps to their page and restores them", async () => {
    await overview();
    fireEvent.click(screen.getByLabelText("Show removed steps (1)"));
    expect(screen.getByRole("link", { name: "Old step" }).getAttribute("href")).toBe("/pipelines/9/steps/23");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await vi.waitFor(() => expect(state.calls).toEqual([["restoreStep", 9, 23]]));
  });

  it("opens the whole pipeline's history", async () => {
    await overview();
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    await screen.findByText("Document uploaded");
    expect(state.calls).toEqual([["history", 9, undefined]]);
  });
});

describe("StepPageView", () => {
  const stepPage = async () => {
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByRole("heading", { name: "Initial review" });
  };

  it("shows the breadcrumb, the neighbours, the checklist and every version", async () => {
    await stepPage();
    const nav = within(screen.getByRole("navigation", { name: "Where you are" }));
    expect(nav.getByRole("link", { name: "IRB pipeline: SNUH" }).getAttribute("href")).toBe("/pipelines/9");
    expect(nav.getByRole("link", { name: "Next step →" }).getAttribute("href")).toBe("/pipelines/9/steps/22");
    expect(nav.queryByRole("link", { name: /Previous step/ })).toBeNull();
    expect(screen.getByText("✓ Protocol", { exact: false })).toBeTruthy();
    expect(screen.getByText("version 2 · p2.docx · 12 KB")).toBeTruthy();
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    expect([...status.options].map((o) => o.textContent)).toEqual(["Not started", "Submitted", "Approved"]);
    fireEvent.click(screen.getByRole("button", { name: "2 versions" }));
    expect(screen.getByRole("button", { name: "Download Protocol version 1" })).toBeTruthy();
  });

  it("changes status and dates; submitting with a required document not done asks first", async () => {
    const ask = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await stepPage();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "submitted" } });
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Consent"));
    expect(state.calls).toEqual([]); // cancelled: nothing saved
    // Auto-save: the controls stay usable while a change is saved; saves go out one at a time.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "submitted" } });
    expect((screen.getByLabelText("IRB submission deadline") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("submitted"); // shown at once
    fireEvent.change(screen.getByLabelText("IRB submission deadline"), { target: { value: "2026-12-31" } });
    await vi.waitFor(() =>
      expect(state.calls).toEqual([
        ["updateStep", 9, 21, { status_key: "submitted" }],
        ["updateStep", 9, 21, { due_on: "2026-12-31" }],
      ]),
    );
    ask.mockRestore();
  });

  it("adds, names and dates an own date of the step, and the memo has no scroll bar", async () => {
    await stepPage();
    fireEvent.click(screen.getByRole("button", { name: "Add a date" }));
    fireEvent.change(screen.getByLabelText("Date name"), { target: { value: "Sponsor deadline" } });
    fireEvent.change(screen.getByLabelText("Sponsor deadline"), { target: { value: "2026-12-05" } });
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual([
        "updateStep", 9, 21, { custom_dates: [{ id: "", label: "Sponsor deadline", day: "2026-12-05" }] },
      ]),
    );
    expect(screen.getByLabelText("Note").className).toContain("overflow-hidden");
  });

  it("groups slots by section and uploads into a slot, checking the file first", async () => {
    await stepPage();
    expect(screen.getByRole("heading", { name: "Application and IRB notices" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Submitted documents" })).toBeTruthy();
    expect(screen.getByText("1 of 2 required documents done", { exact: false })).toBeTruthy();
    const empty = screen.getByLabelText("Upload a file: Consent");
    fireEvent.change(empty, { target: { files: [new File([], "empty.pdf")] } });
    expect((await screen.findByRole("alert")).textContent).toBe("The file is empty.");
    fireEvent.change(empty, { target: { files: [new File(["abc"], "icf.pdf")] } });
    await screen.findByText("Uploaded version 3 of Consent.");
    expect(state.calls).toEqual([["upload", 9, 21, "Consent", "icf.pdf", 32]]);
  });

  it("marks a slot final or not needed, reopens one, and adds a document of the user's own", async () => {
    await stepPage();
    fireEvent.click(screen.getByRole("button", { name: "Mark final" })); // 신청서: a file, in progress
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateDocument", 9, 21, 33, { status: "final" }]));
    fireEvent.click(screen.getByRole("button", { name: "Reopen" })); // Protocol: final
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateDocument", 9, 21, 31, { status: "needed" }]));
    // Consent has no file: no "Mark final", only "Not needed".
    const notNeeded = screen.getAllByRole("button", { name: "Not needed" });
    expect(notNeeded).toHaveLength(2);
    // Listed documents are never removed (marked not needed instead).
    expect(screen.queryAllByRole("button", { name: "Remove" })).toHaveLength(0);
    const form = within(screen.getByRole("form", { name: "Add a document" }));
    fireEvent.click(form.getByRole("button", { name: "Add" }));
    expect((await form.findByRole("alert")).textContent).toBe("Enter a document name.");
    fireEvent.change(form.getByLabelText("Document name"), { target: { value: "심의 서류 바인더" } });
    fireEvent.change(form.getByLabelText("Section"), { target: { value: "reference" } });
    fireEvent.click(form.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(state.calls).toContainEqual(["addDocument", 9, 21, "심의 서류 바인더", "reference"]));
  });

  it("asks before removing the step", async () => {
    await stepPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove step" }));
    expect(state.calls).toEqual([]);
    const confirm = within(screen.getByText(/Remove this step\?/).closest("section") as HTMLElement);
    fireEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => expect(state.calls).toContainEqual(["removeStep", 9, 21]));
  });

  it("shows a removed step read-only with Restore", async () => {
    state.page = { step: { ...INITIAL, deleted_at: "2026-11-12T00:00:00Z" }, previous_step_id: null, next_step_id: null };
    await stepPage();
    expect(screen.getByText(/This step is removed/)).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole("form", { name: "Add a document" })).toBeNull();
    expect(screen.queryByLabelText("Upload a file: Consent")).toBeNull();
    expect(screen.queryByRole("button", { name: "Draft for this step" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove step" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download the latest Protocol" })).toBeTruthy(); // files stay downloadable
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await vi.waitFor(() => expect(state.calls).toEqual([["restoreStep", 9, 21]]));
  });

  it("sends a step of a removed pipeline to the overview, with no Restore here", async () => {
    state.page = { pipeline: { ...SUMMARY, deleted_at: "2026-11-12T00:00:00Z" } };
    await stepPage();
    expect(screen.getByText(/This pipeline is removed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the pipeline" }).getAttribute("href")).toBe("/pipelines/9");
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect((screen.getByLabelText("IRB submission deadline") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the server's reason when the step cannot be opened", async () => {
    state.page = {};
    const { pipelineApi } = await import("../src/lib/api/pipelines");
    const spy = vi.spyOn(pipelineApi, "getStep").mockRejectedValueOnce(new ApiError(404, "step not found"));
    wrap(<StepPageView id={9} stepId={99} />);
    expect((await screen.findByRole("alert")).textContent).toBe("step not found");
    spy.mockRestore();
  });

  it("shows support access read-only: no edits, files still downloadable", async () => {
    state.page = { access: "read" };
    await stepPage();
    expect(screen.getByText(/You can read this pipeline but not change it/)).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole("form", { name: "Add a document" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark final" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Draft for this step" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove step" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download the latest Protocol" })).toBeTruthy();
  });

  it("names a colleague's draft and job in a shared project", async () => {
    state.drafts = [{ id: "d-1", title: "Shared draft", pipeline_step_id: 21, updated_at: "2026-11-12T02:00:00Z", documents: [], author: "Kim" }];
    state.jobs = [JOB("running", { mine: false, started_by: "Lee" })];
    await stepPage();
    expect(screen.getByText("by Kim")).toBeTruthy();
    expect(screen.getByText(/being written.*\(started by Lee\)/)).toBeTruthy();
  });

  it("opens this step's history only", async () => {
    await stepPage();
    fireEvent.click(screen.getByRole("button", { name: "Show this step's history" }));
    await screen.findByText("Document uploaded");
    expect(state.calls).toEqual([["history", 9, 21]]);
  });
});

describe("AI drafts of a step", () => {
  const draftsOf = async () => {
    wrap(<StepPageView id={9} stepId={21} />);
    await screen.findByRole("heading", { name: "Initial review" });
    return within(screen.getByRole("heading", { name: "AI drafts" }).closest("section") as HTMLElement);
  };

  it("lists the step's drafts and a failed job with its reason", async () => {
    state.drafts = [{ id: "d-1", title: "Initial submission", pipeline_step_id: 21, updated_at: "2026-11-12T02:00:00Z", documents: [] }];
    state.jobs = [JOB("failed", { error: "the AI could not write the draft (TimeoutError); please try again", finished_at: "2026-11-12T01:05:00Z" })];
    const step = await draftsOf();
    expect((await step.findByRole("link", { name: "Initial submission" })).getAttribute("href")).toBe("/drafts/d-1");
    expect((await step.findByRole("alert")).textContent).toContain("TimeoutError");
  });

  it("says so when the step has no drafts", async () => {
    const step = await draftsOf();
    expect(step.getByText("No AI drafts in this step yet.")).toBeTruthy();
  });

  it("names every own file that will be sent, and starts a job with the ticked ones", async () => {
    const step = await draftsOf();
    fireEvent.click(await step.findByRole("button", { name: "Draft for this step" }));
    const dialog = within(await step.findByRole("form", { name: "Draft for this step" }));
    const scan = dialog.getByRole("checkbox", { name: /Scan/ }) as HTMLInputElement;
    expect(scan.disabled).toBe(true); // no readable text: listed, never sent
    expect(dialog.getByText(/cannot be sent: this file type has no readable text/)).toBeTruthy();
    expect(dialog.getByText(/will be sent to the AI service: Protocol \(p2\.docx\)\./)).toBeTruthy();
    expect(dialog.getByText(/this step's own AI instructions are used/)).toBeTruthy();
    expect(dialog.queryByText("Hospital board documents (optional)")).toBeNull(); // the step type does not allow them
    fireEvent.change(dialog.getByLabelText(/What should the draft say/), { target: { value: " first submission " } });
    fireEvent.click(dialog.getByRole("button", { name: "Start the draft" }));
    await step.findByText(/The draft is being written\. You can leave this page/);
    expect(state.calls).toEqual([
      [
        "startStepDraft",
        21,
        {
          step_files: [{ document_id: 31, version_no: 2 }],
          documents: [],
          guide_ids: null,
          extra_guides: [],
          instruction: "first submission",
          ai_override_source_ids: [],
          template_id: 20,
        },
      ],
    ]);
    // The step page is loaded again: it shows the open job, and a second draft cannot start meanwhile.
    await step.findByText(/A draft is waiting to be written/);
    expect((step.getByRole("button", { name: "Draft for this step" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cannot start with nothing chosen, and shows the server's refusal", async () => {
    const step = await draftsOf();
    fireEvent.click(await step.findByRole("button", { name: "Draft for this step" }));
    const dialog = within(await step.findByRole("form", { name: "Draft for this step" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: /Protocol/ }));
    expect(dialog.getByText("None of your own files will be sent.")).toBeTruthy();
    expect((dialog.getByRole("button", { name: "Start the draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialog.getByRole("checkbox", { name: /Protocol/ }));
    fireEvent.click(dialog.getByRole("checkbox", { name: /Fill this step's form/ }));
    state.startError = new ApiError(429, "2 of your drafts are being written already; wait for one to finish");
    fireEvent.click(dialog.getByRole("button", { name: "Start the draft" }));
    expect((await dialog.findByRole("alert")).textContent).toContain("2 of your drafts");
    expect(state.calls).toEqual([]);
  });

  it("warns that a members-only board goes into a draft every project member reads (O22)", async () => {
    state.inputs = { ...INPUTS, allow_board_documents: true };
    state.boards = [{ id: 86, name: "Kimpo : forms", requires_login: true, ai_enabled: true }];
    state.page = { shared: true };
    const step = await draftsOf();
    fireEvent.click(await step.findByRole("button", { name: "Draft for this step" }));
    const dialog = within(await step.findByRole("form", { name: "Draft for this step" }));
    await dialog.findByRole("option", { name: /Kimpo : forms/ });
    expect(dialog.queryByText(/shared with the project's members/)).toBeNull(); // nothing chosen yet
  });

  it("offers the hospital's board documents only when the step type allows them", async () => {
    state.inputs = { ...INPUTS, allow_board_documents: true, form_template_id: null, has_instructions: false };
    state.boards = [{ id: 86, name: "Kimpo : forms", requires_login: true, ai_enabled: false }];
    const step = await draftsOf();
    fireEvent.click(await step.findByRole("button", { name: "Draft for this step" }));
    const dialog = within(await step.findByRole("form", { name: "Draft for this step" }));
    expect(dialog.getByText("Hospital board documents (optional)")).toBeTruthy();
    await dialog.findByRole("option", { name: /Kimpo : forms/ });
    expect(dialog.queryByRole("checkbox", { name: /Fill this step's form/ })).toBeNull();
    expect(dialog.getByText("The hospital's guides are used.")).toBeTruthy();
  });
});
