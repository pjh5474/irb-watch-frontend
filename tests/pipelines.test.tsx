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
  step: INITIAL,
  statuses: STATUSES,
  checklist: [
    { name: "Protocol", uploaded: true },
    { name: "Consent", uploaded: false },
  ],
  documents: [
    {
      id: 31,
      name: "Protocol",
      created_at: "2026-11-11T00:00:00Z",
      deleted_at: null,
      versions: [
        { version_no: 2, filename: "p2.docx", size_bytes: 12_000, has_text: true, text_note: null, created_at: "2026-11-12T00:00:00Z" },
        { version_no: 1, filename: "p1.docx", size_bytes: 11_000, has_text: true, text_note: null, created_at: "2026-11-11T00:00:00Z" },
      ],
    },
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
}));

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
      start: async (projectId: number, hospitalId: number) => {
        if (state.startError) throw state.startError;
        state.calls.push(["start", projectId, hospitalId]);
        return { id: 77 };
      },
      get: async () => DETAIL,
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
      upload: async (id: number, stepId: number, name: string, file: { filename: string }) => {
        state.calls.push(["upload", id, stepId, name, file.filename]);
        return { document: { name }, version_no: 3 };
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
});

afterEach(cleanup);

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

describe("ProjectPipelines", () => {
  it("starts a pipeline for a hospital without one and links the others", async () => {
    state.list = [SUMMARY];
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 4, name: "SNUH" }, { id: 5, name: "Ewha" }]} />);
    expect((await screen.findByRole("link", { name: "Open" })).getAttribute("href")).toBe("/pipelines/9");
    expect(screen.getByText("1 of 2 steps finished")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start IRB pipeline" }));
    await vi.waitFor(() => expect(state.pushed).toEqual(["/pipelines/77"]));
    expect(state.calls).toEqual([["start", 1, 5]]);
  });

  it("shows the server's reason when starting fails", async () => {
    state.startError = new ApiError(409, "this hospital already has a pipeline in the project");
    wrap(<ProjectPipelines projectId={1} hospitals={[{ id: 5, name: "Ewha" }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start IRB pipeline" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already has a pipeline");
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
    expect(meeting.getByText("Decided 2026-11-11")).toBeTruthy();
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
    expect(state.calls).toEqual([["addStep", 9, { step_type_id: 2, name: null }]]);
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

  it("changes status and dates", async () => {
    await stepPage();
    // One change at a time: the controls are disabled while a change is saved.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "submitted" } });
    await vi.waitFor(() => expect((screen.getByLabelText("Due date") as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-31" } });
    await vi.waitFor(() =>
      expect(state.calls).toEqual([
        ["updateStep", 9, 21, { status_key: "submitted" }],
        ["updateStep", 9, 21, { due_on: "2026-12-31" }],
      ]),
    );
  });

  it("uploads to a checklist name or a typed one, and checks the file first", async () => {
    await stepPage();
    const form = within(screen.getByRole("form", { name: "Upload a document" }));
    fireEvent.click(form.getByRole("button", { name: "Upload" }));
    expect((await form.findByRole("alert")).textContent).toBe("Choose a file.");
    const names = form.getByLabelText("Document name") as HTMLSelectElement;
    expect([...names.options].map((o) => o.textContent)).toEqual(["Protocol", "Consent", "Other name…"]);
    fireEvent.change(names, { target: { value: "Consent" } });
    fireEvent.change(form.getByLabelText("File"), { target: { files: [new File(["abc"], "icf.pdf")] } });
    fireEvent.click(form.getByRole("button", { name: "Upload" }));
    await form.findByText("Uploaded version 3 of Consent.");
    expect(state.calls).toEqual([["upload", 9, 21, "Consent", "icf.pdf"]]);
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
    expect(screen.queryByRole("form", { name: "Upload a document" })).toBeNull();
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
    expect((screen.getByLabelText("Due date") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the server's reason when the step cannot be opened", async () => {
    state.page = {};
    const { pipelineApi } = await import("../src/lib/api/pipelines");
    const spy = vi.spyOn(pipelineApi, "getStep").mockRejectedValueOnce(new ApiError(404, "step not found"));
    wrap(<StepPageView id={9} stepId={99} />);
    expect((await screen.findByRole("alert")).textContent).toBe("step not found");
    spy.mockRestore();
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
