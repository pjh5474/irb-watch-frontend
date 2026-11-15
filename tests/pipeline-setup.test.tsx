import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { PipelineSetup } from "../src/components/admin/pipeline-setup";
import { ApiError } from "../src/lib/api/client";
import { moved, repeatedName, type StepType } from "../src/lib/api/pipeline";

const TYPE = (id: number, name: string): StepType => ({
  id,
  name,
  description: "",
  instructions: "",
  guide_ids: [],
  form_template_id: null,
  input_earlier_steps: true,
  input_board_documents: false,
  archived_at: null,
  updated_at: "",
  category: "other",
  numbered: false,
});

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  archiveError: null as unknown,
  types: [] as unknown[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/admin/pipeline",
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    hospitals: async () => ({
      hospitals: [{ id: 4, name: "SNUH", note: "", created_at: "", updated_at: "", boards: [] }],
      board_kinds: ["notice", "forms", "regulations", "other"],
    }),
  },
}));

vi.mock("@/lib/api/docgen", () => ({
  docgenApi: {
    guides: async () => [{ id: 10, title: "SNUH guide" }],
    adminTemplates: async () => [
      { id: 20, title: "Amendment form", status: "ready" },
      { id: 21, title: "Draft form", status: "review" },
    ],
  },
}));

vi.mock("@/lib/api/pipeline", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/pipeline")>("../src/lib/api/pipeline");
  return {
    ...actual,
    pipelineAdminApi: {
      statuses: async () => [
        { key: "not_started", label: "Not started", closed: false, position: 1, archived_at: null },
        { key: "approved", label: "Approved", closed: true, position: 2, archived_at: null },
      ],
      addStatus: async (...args: unknown[]) => state.calls.push(["addStatus", ...args]),
      updateStatus: async (...args: unknown[]) => state.calls.push(["updateStatus", ...args]),
      reorderStatuses: async (keys: string[]) => state.calls.push(["reorder", keys]),
      archiveStatus: async (key: string) => state.calls.push(["archiveStatus", key]),
      restoreStatus: async () => {},
      stepTypes: async () => state.types,
      createStepType: async (body: unknown) => state.calls.push(["create", body]),
      updateStepType: async (id: number, body: unknown) => state.calls.push(["update", id, body]),
      archiveStepType: async (id: number) => {
        if (state.archiveError) throw state.archiveError;
        state.calls.push(["archiveType", id]);
      },
      restoreStepType: async () => {},
      results: async () => [
        { key: "approved", label: "Approved", approved: true, needs_answer: false, position: 1, archived_at: null },
        { key: "revision", label: "Revision", approved: false, needs_answer: true, position: 2, archived_at: null },
      ],
      addResult: async (body: unknown) => state.calls.push(["addResult", body]),
      updateResult: async (key: string, body: unknown) => state.calls.push(["updateResult", key, body]),
      reorderResults: async (keys: string[]) => state.calls.push(["reorderResults", keys]),
      archiveResult: async (key: string) => state.calls.push(["archiveResult", key]),
      restoreResult: async () => {},
      templates: async () => [{ hospital_id: null, step_type_ids: [1, 3], updated_at: "x" }],
      saveTemplate: async (hospitalId: number | null, ids: number[]) => state.calls.push(["saveTemplate", hospitalId, ids]),
      deleteTemplate: async () => {},
      documentLists: async (typeId: number) => ({
        step_type_id: typeId,
        global_documents: [
          { id: 101, name: "신청서", section: "application", origin: "draft", required: true },
          { id: 102, name: "Protocol", section: "submission", origin: "library", required: true },
        ],
        hospitals: [],
      }),
      saveDocuments: async (typeId: number, hospitalId: number | null, rows: unknown) => {
        state.calls.push(["saveDocuments", typeId, hospitalId, rows]);
        return { step_type_id: typeId, global_documents: [], hospitals: [] };
      },
      deleteHospitalDocuments: async (typeId: number, hospitalId: number) => {
        state.calls.push(["deleteHospitalDocuments", typeId, hospitalId]);
        return { step_type_id: typeId, global_documents: [], hospitals: [] };
      },
    },
  };
});

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        <PipelineSetup />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const section = async (name: string) =>
  (await screen.findByRole("heading", { name })).closest("section") as HTMLElement;

beforeEach(() => {
  state.calls = [];
  state.archiveError = null;
  state.types = [TYPE(1, "Initial review"), TYPE(2, "Amendment"), TYPE(3, "Closure")];
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("helpers", () => {
  it("moves items and finds a repeated document name", () => {
    expect(moved([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(repeatedName([{ name: "Protocol" }, { name: " consent  form" }, { name: "protocol " }])).toBe("protocol");
    expect(repeatedName([{ name: "A" }, { name: "B" }])).toBeNull();
  });
});

describe("PipelineSetup", () => {
  it("edits the global order: add, move, save", async () => {
    wrap();
    const order = await section("Default step order");
    await within(order).findByText("Initial review");
    fireEvent.change(within(order).getByLabelText("Add a step…"), { target: { value: "2" } });
    fireEvent.click(within(order).getByRole("button", { name: "Add" }));
    fireEvent.click(within(order).getByRole("button", { name: "Move Amendment up" }));
    fireEvent.click(within(order).getByRole("button", { name: "Save global order" }));
    await within(order).findByText(/Step order saved/);
    expect(state.calls).toEqual([["saveTemplate", null, [1, 2, 3]]]);
  });

  it("a hospital without its own order starts from the global one and saves its own", async () => {
    wrap();
    const order = await section("Default step order");
    await within(order).findByText("Initial review");
    fireEvent.change(within(order).getByLabelText("Order for"), { target: { value: "4" } });
    await within(order).findByText(/uses the global order/);
    fireEvent.click(within(order).getByRole("button", { name: "Remove Closure" }));
    fireEvent.click(within(order).getByRole("button", { name: "Save order for this hospital" }));
    await within(order).findByText(/Step order saved/);
    expect(state.calls).toEqual([["saveTemplate", 4, [1]]]);
  });

  it("creates a step type with guides, a ready form and inputs", async () => {
    wrap();
    const types = await section("Step types");
    fireEvent.click(await within(types).findByRole("button", { name: "New step type" }));
    fireEvent.change(within(types).getByLabelText("Name"), { target: { value: " SAE report " } });
    fireEvent.change(within(types).getByLabelText("AI instructions for this step"), { target: { value: "Be brief." } });
    fireEvent.click(await within(types).findByLabelText("SNUH guide"));
    const form = within(types).getByLabelText("Default form") as HTMLSelectElement;
    await within(types).findByRole("option", { name: "Amendment form" });
    expect(within(types).queryByRole("option", { name: "Draft form" })).toBeNull();
    fireEvent.change(form, { target: { value: "20" } });
    fireEvent.click(within(types).getByLabelText("The hospital's board documents"));
    fireEvent.click(within(types).getByRole("button", { name: "Save" }));
    await within(types).findByText("Saved.");
    expect(state.calls).toEqual([
      [
        "create",
        {
          name: "SAE report",
          description: "",
          instructions: "Be brief.",
          guide_ids: [10],
          form_template_id: 20,
          input_earlier_steps: true,
          input_board_documents: true,
          category: "other",
          numbered: false,
        },
      ],
    ]);
  });

  it("sets a step type's category and numbering; follow-up types stay out of the order picker", async () => {
    state.types = [...state.types, { ...TYPE(7, "Answer"), category: "follow_up", numbered: true }];
    wrap();
    const order = await section("Default step order");
    await within(order).findByText("Initial review");
    const picker = within(order).getByLabelText("Add a step…") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).not.toContain("Answer");
    const types = await section("Step types");
    expect(within(types).getByText("Follow-up")).toBeTruthy();
    fireEvent.click(within(types).getAllByRole("button", { name: "Edit" })[1]); // Amendment
    fireEvent.change(within(types).getByLabelText("Category"), { target: { value: "amendment" } });
    fireEvent.click(within(types).getByLabelText("Numbered in rounds (1차, 2차, ...)"));
    fireEvent.click(within(types).getByRole("button", { name: "Save" }));
    await within(types).findByText("Saved.");
    expect(state.calls[0]).toEqual([
      "update", 2,
      expect.objectContaining({ name: "Amendment", category: "amendment", numbered: true }),
    ]);
  });

  it("edits a step type's global document list and makes a hospital's own copy", async () => {
    wrap();
    const types = await section("Step types");
    await within(types).findByText("Initial review");
    fireEvent.click(within(types).getAllByRole("button", { name: "Documents" })[0]);
    const editor = within(types);
    await editor.findByDisplayValue("Protocol");
    fireEvent.click(editor.getByRole("button", { name: "Add a document" }));
    const names = editor.getAllByLabelText("Document") as HTMLInputElement[];
    const sections = editor.getAllByLabelText("Section") as HTMLSelectElement[];
    fireEvent.change(sections[2], { target: { value: "received" } });
    // A document from the IRB is never required: its box is off and disabled.
    expect((editor.getAllByLabelText("Required") as HTMLInputElement[])[2].disabled).toBe(true);
    fireEvent.change(names[2], { target: { value: "protocol" } });
    fireEvent.click(editor.getByRole("button", { name: "Save" }));
    expect((await editor.findByRole("alert")).textContent).toBe("protocol is in the list twice.");
    fireEvent.change(names[2], { target: { value: "통지서" } });
    fireEvent.click(editor.getByRole("button", { name: "Move Protocol up" }));
    fireEvent.click(editor.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual(["saveDocuments", 1, null, [
        { id: 102, name: "Protocol", section: "submission", origin: "library", required: true },
        { id: 101, name: "신청서", section: "application", origin: "draft", required: true },
        { id: null, name: "통지서", section: "received", origin: "upload", required: false },
      ]]),
    );
    // A hospital without its own list uses the global one; making its own copies the rows (new ids).
    fireEvent.change(editor.getByLabelText("List"), { target: { value: "4" } });
    fireEvent.click(await editor.findByRole("button", { name: "Make a list for this hospital" }));
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual(["saveDocuments", 1, 4, [
        { id: null, name: "신청서", section: "application", origin: "draft", required: true },
        { id: null, name: "Protocol", section: "submission", origin: "library", required: true },
      ]]),
    );
  });

  it("edits the IRB results list", async () => {
    wrap();
    const results = await section("IRB results");
    await within(results).findByDisplayValue("Approved");
    expect(within(results).getByText("Needs an answer", { selector: "span" })).toBeTruthy();
    fireEvent.change(within(results).getByLabelText("New result"), { target: { value: " Deferred " } });
    fireEvent.click(within(results).getByRole("button", { name: "Add" }));
    const add = within(results).getByRole("button", { name: "Add" }) as HTMLButtonElement;
    const idle = () => vi.waitFor(() => expect(add.disabled).toBe(false)); // one change at a time
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual(["addResult", { label: "Deferred", approved: false, needs_answer: false }]),
    );
    await idle();
    fireEvent.click(within(results).getAllByRole("button", { name: "Not approved" })[0]);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["updateResult", "approved", { approved: false }]));
    await idle();
    fireEvent.click(within(results).getByRole("button", { name: "Move Approved down" }));
    await vi.waitFor(() => expect(state.calls).toContainEqual(["reorderResults", ["revision", "approved"]]));
    await idle();
    fireEvent.click(within(results).getAllByRole("button", { name: "Archive" })[1]);
    await vi.waitFor(() => expect(state.calls).toContainEqual(["archiveResult", "revision"]));
  });

  it("with the docs generator off, hides the AI fields and saves their stored values unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "false");
    state.types = [
      {
        ...TYPE(2, "Amendment"),
        instructions: "Stored rules.",
        guide_ids: [10],
        form_template_id: 20,
        input_board_documents: true,
      },
    ];
    wrap();
    const types = await section("Step types");
    await within(types).findByText("Amendment");
    expect(within(types).queryByText("AI instructions")).toBeNull(); // the badge
    fireEvent.click(within(types).getByRole("button", { name: "Edit" }));
    expect(within(types).queryByLabelText("AI instructions for this step")).toBeNull();
    expect(within(types).queryByLabelText("Default form")).toBeNull();
    expect(within(types).queryByLabelText("SNUH guide")).toBeNull();
    fireEvent.change(within(types).getByLabelText("Name"), { target: { value: "Amendment review" } });
    fireEvent.click(within(types).getByRole("button", { name: "Save" }));
    await within(types).findByText("Saved.");
    expect(state.calls).toEqual([
      [
        "update",
        2,
        {
          name: "Amendment review",
          description: "",
          instructions: "Stored rules.",
          guide_ids: [10],
          form_template_id: 20,
          input_earlier_steps: true,
          input_board_documents: true,
          category: "other",
          numbered: false,
        },
      ],
    ]);
  });

  it("shows why archiving a step type was refused", async () => {
    state.archiveError = new ApiError(409, "remove it from the default step order first (global)");
    wrap();
    const types = await section("Step types");
    await within(types).findByText("Initial review");
    fireEvent.click(within(types).getAllByRole("button", { name: "Archive" })[0]);
    expect((await within(types).findByRole("alert")).textContent).toContain("default step order first");
  });

  it("adds, reorders and closes statuses", async () => {
    wrap();
    const statuses = await section("Step statuses");
    await within(statuses).findByDisplayValue("Not started");
    fireEvent.change(within(statuses).getByLabelText("New status"), { target: { value: "On hold" } });
    fireEvent.click(within(statuses).getByRole("button", { name: "Add" }));
    await within(statuses).findByText("Saved.");
    fireEvent.click(within(statuses).getByRole("button", { name: "Move Approved up" }));
    await within(statuses).findByText("Saved.");
    expect(state.calls).toEqual([
      ["addStatus", "On hold", false],
      ["reorder", ["approved", "not_started"]],
    ]);
  });
});
