import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { PipelineView } from "../src/components/pipelines/pipeline-view";
import { ProjectPipelines } from "../src/components/pipelines/project-pipelines";
import { ApiError } from "../src/lib/api/client";
import { daysUntil, sizeLabel, todaySeoul, type PipelineDetail, type PipelineSummary } from "../src/lib/api/pipelines";

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

const DETAIL: PipelineDetail = {
  pipeline: SUMMARY,
  statuses: [
    { key: "not_started", label: "Not started", closed: false, archived: false },
    { key: "submitted", label: "Submitted", closed: false, archived: false },
    { key: "approved", label: "Approved", closed: true, archived: false },
    { key: "old", label: "Old", closed: false, archived: true },
  ],
  step_types: [{ id: 2, name: "Amendment", description: "" }],
  steps: [
    {
      id: 21,
      step_type_id: 1,
      step_type_name: "Initial review",
      name: "Initial review",
      position: 1,
      status_key: "not_started",
      due_on: null,
      submitted_on: null,
      decided_on: null,
      note: "",
      deleted_at: null,
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
    },
    {
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
      checklist: [],
      documents: [],
    },
  ],
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
      pipelineDrafts: async () => state.drafts,
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
      history: async () => [
        { id: 1, step_id: 21, mine: true, event_type: "document.uploaded", payload: { name: "Protocol" }, created_at: "2026-11-11T01:02:00Z" },
      ],
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

describe("PipelineView", () => {
  it("shows steps, checklist, versions, overdue only for open steps, and archived statuses hidden", async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    expect(screen.getByText("✓ Protocol", { exact: false })).toBeTruthy();
    expect(screen.getByText("version 2 · p2.docx · 12 KB")).toBeTruthy();
    expect(screen.queryByText(/overdue/)).toBeNull(); // the overdue step is approved (closed)
    const status = screen.getAllByLabelText("Status")[0] as HTMLSelectElement;
    expect([...status.options].map((o) => o.textContent)).toEqual(["Not started", "Submitted", "Approved"]);
    fireEvent.click(screen.getByRole("button", { name: "2 versions" }));
    expect(screen.getByRole("button", { name: "Download Protocol version 1" })).toBeTruthy();
  });

  it("changes status, dates and order", async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    // One change at a time: the controls are disabled while a change is saved.
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "submitted" } });
    await vi.waitFor(() => expect((screen.getAllByLabelText("Due date")[0] as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getAllByLabelText("Due date")[0], { target: { value: "2026-12-31" } });
    await vi.waitFor(() => expect(state.calls.length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Move Meeting up" }));
    await vi.waitFor(() =>
      expect(state.calls).toEqual([
        ["updateStep", 9, 21, { status_key: "submitted" }],
        ["updateStep", 9, 21, { due_on: "2026-12-31" }],
        ["reorder", 9, [22, 21]],
      ]),
    );
  });

  it("uploads to a checklist name or a typed one, and checks the file first", async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    const step = screen.getAllByRole("listitem").find((li) => li.textContent?.includes("Required documents")) as HTMLElement;
    const form = within(step);
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

  it("adds a typed step and asks before removing a step", async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByText("Choose a step type or enter a name."))).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Step type"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Step added.");
    const meeting = screen.getAllByRole("listitem").find((li) => li.querySelector("input")?.value === "Meeting") as HTMLElement;
    fireEvent.click(within(meeting).getByRole("button", { name: "Remove step" }));
    expect(state.calls).toEqual([["addStep", 9, { step_type_id: 2, name: null }]]);
    fireEvent.click(within(meeting).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => expect(state.calls).toContainEqual(["removeStep", 9, 22]));
  });

  it("opens the history", async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    await screen.findByText("Document uploaded");
  });
});

describe("AI drafts of a step", () => {
  const firstStep = async () => {
    wrap(<PipelineView id={9} />);
    await screen.findByRole("heading", { name: "IRB pipeline: SNUH" });
    return within(screen.getAllByRole("listitem").find((li) => li.querySelector("input")?.value === "Initial review") as HTMLElement);
  };

  it("lists the step's drafts and a failed job with its reason", async () => {
    state.drafts = [
      { id: "d-1", title: "Initial submission", pipeline_step_id: 21, updated_at: "2026-11-12T02:00:00Z", documents: [] },
      { id: "d-2", title: "Other step", pipeline_step_id: 22, updated_at: "2026-11-12T02:00:00Z", documents: [] },
    ];
    state.jobs = [JOB("failed", { error: "the AI could not write the draft (TimeoutError); please try again", finished_at: "2026-11-12T01:05:00Z" })];
    const step = await firstStep();
    expect((await step.findByRole("link", { name: "Initial submission" })).getAttribute("href")).toBe("/drafts/d-1");
    expect(step.queryByRole("link", { name: "Other step" })).toBeNull();
    expect((await step.findByRole("alert")).textContent).toContain("TimeoutError");
  });

  it("names every own file that will be sent, and starts a job with the ticked ones", async () => {
    const step = await firstStep();
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
    // The step now shows the open job, and a second draft cannot be started meanwhile.
    await step.findByText(/A draft is waiting to be written/);
    expect((step.getByRole("button", { name: "Draft for this step" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cannot start with nothing chosen, and shows the server's refusal", async () => {
    const step = await firstStep();
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
    const step = await firstStep();
    fireEvent.click(await step.findByRole("button", { name: "Draft for this step" }));
    const dialog = within(await step.findByRole("form", { name: "Draft for this step" }));
    expect(dialog.getByText("Hospital board documents (optional)")).toBeTruthy();
    await dialog.findByRole("option", { name: /Kimpo : forms/ });
    expect(dialog.queryByRole("checkbox", { name: /Fill this step's form/ })).toBeNull();
    expect(dialog.getByText("The hospital's guides are used.")).toBeTruthy();
  });
});
