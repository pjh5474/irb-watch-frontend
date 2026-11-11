import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { PipelineSetup } from "../src/components/admin/pipeline-setup";
import { ApiError } from "../src/lib/api/client";
import { moved, requiredDocsFromText, type StepType } from "../src/lib/api/pipeline";

const TYPE = (id: number, name: string): StepType => ({
  id,
  name,
  description: "",
  instructions: "",
  guide_ids: [],
  form_template_id: null,
  input_earlier_steps: true,
  input_board_documents: false,
  required_documents: [],
  archived_at: null,
  updated_at: "",
});

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  archiveError: null as unknown,
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
  adminApi: { sources: async () => [{ id: 4, name: "SNUH board" }] },
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
      stepTypes: async () => [TYPE(1, "Initial review"), TYPE(2, "Amendment"), TYPE(3, "Closure")],
      createStepType: async (body: unknown) => state.calls.push(["create", body]),
      updateStepType: async (id: number, body: unknown) => state.calls.push(["update", id, body]),
      archiveStepType: async (id: number) => {
        if (state.archiveError) throw state.archiveError;
        state.calls.push(["archiveType", id]);
      },
      restoreStepType: async () => {},
      templates: async () => [{ source_id: null, step_type_ids: [1, 3], updated_at: "x" }],
      saveTemplate: async (sourceId: number | null, ids: number[]) => state.calls.push(["saveTemplate", sourceId, ids]),
      deleteTemplate: async () => {},
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
});

afterEach(cleanup);

describe("helpers", () => {
  it("moves items and parses required documents", () => {
    expect(moved([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(requiredDocsFromText(" Protocol \n\nprotocol\nConsent   form\n")).toEqual(["Protocol", "Consent form"]);
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

  it("creates a step type with guides, a ready form, inputs and required documents", async () => {
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
    fireEvent.change(within(types).getByLabelText("Required documents"), { target: { value: "CIOMS\nCIOMS\nLetter" } });
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
          required_documents: ["CIOMS", "Letter"],
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
