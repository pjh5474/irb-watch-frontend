import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AiInstructions } from "../src/components/admin/ai-instructions";
import { ApiError } from "../src/lib/api/client";
import type { Feature, InstructionVersion } from "../src/lib/api/ai";

const state = vi.hoisted(() => ({
  rows: [] as InstructionVersion[],
  tests: [] as unknown[],
  testError: null as unknown,
}));

vi.mock("@/lib/api/ai", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/ai")>("../src/lib/api/ai");
  const add = (feature: Feature, body: string, restored_from: number | null = null) => {
    const row = { id: state.rows.length + 1, feature, body, created_by: "a", created_at: "2026-11-10T00:00:00Z", restored_from };
    state.rows.push(row);
    return row;
  };
  const latest = (f: Feature) => [...state.rows].reverse().find((r) => r.feature === f) ?? null;
  return {
    ...actual,
    aiApi: {
      current: async () => actual.FEATURES.map((feature) => ({ feature, current: latest(feature) })),
      history: async (f: Feature) => [...state.rows].reverse().filter((r) => r.feature === f),
      save: async (f: Feature, body: string) => add(f, body.trim()),
      reset: async (f: Feature) => add(f, ""),
      restore: async (f: Feature, id: number) => add(f, state.rows.find((r) => r.id === id)!.body, id),
      test: async (...args: unknown[]) => {
        state.tests.push(args);
        if (state.testError) throw state.testError;
        return { text: "**Test answer**", note: "tools used: none" };
      },
    },
  };
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <AiInstructions />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const card = async (name: string) => (await screen.findByRole("heading", { name })).closest("section")! as HTMLElement;

beforeEach(() => {
  state.rows = [];
  state.tests = [];
  state.testError = null;
});
afterEach(cleanup);

describe("AiInstructions", () => {
  it("shows one card per feature, each on defaults", async () => {
    show();
    for (const name of ["Chat assistant", "Docs generator", "Summaries"]) {
      expect(within(await card(name)).getByText(/defaults are in use/)).toBeTruthy();
    }
  });

  it("saves, then restores and resets through the history", async () => {
    show();
    const chat = await card("Chat assistant");
    const box = within(chat).getByLabelText("Added instructions");
    const save = within(chat).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Be formal" } });
    fireEvent.click(save);
    expect(await within(chat).findByText("Saved. The next AI answer uses it.")).toBeTruthy();
    expect(state.rows.map((r) => r.body)).toEqual(["Be formal"]);

    fireEvent.change(box, { target: { value: "Be brief" } });
    fireEvent.click(save);
    await waitFor(() => expect(state.rows).toHaveLength(2));

    fireEvent.click(within(chat).getByRole("button", { name: "Show history" }));
    fireEvent.click(await within(chat).findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(state.rows[2]).toMatchObject({ body: "Be formal", restored_from: 1 }));
    expect((box as HTMLTextAreaElement).value).toBe("Be formal");

    fireEvent.click(within(chat).getByRole("button", { name: "Reset to default" }));
    fireEvent.click(within(chat).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(state.rows[3].body).toBe(""));
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses more than 4,000 characters", async () => {
    show();
    const chat = await card("Chat assistant");
    fireEvent.change(within(chat).getByLabelText("Added instructions"), { target: { value: "x".repeat(4001) } });
    expect(within(chat).getByText(/At most 4,?000 characters\./)).toBeTruthy();
    expect((within(chat).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tests the unsaved text: chat with a question, summary with a document and kind", async () => {
    show();
    const chat = await card("Chat assistant");
    fireEvent.change(within(chat).getByLabelText("Added instructions"), { target: { value: "Unsaved" } });
    fireEvent.click(within(chat).getByRole("button", { name: "Run test" }));
    expect((await within(chat).findByRole("alert")).textContent).toBe("Type a question.");
    fireEvent.change(within(chat).getByLabelText("Question"), { target: { value: "hi" } });
    fireEvent.click(within(chat).getByRole("button", { name: "Run test" }));
    expect(await within(chat).findByText("Test answer")).toBeTruthy();
    expect(state.tests[0]).toEqual(["agent", "Unsaved", null, "hi"]);
    expect(state.rows).toEqual([]); // nothing saved

    const summary = await card("Summaries");
    fireEvent.change(within(summary).getByLabelText(/Document id/), { target: { value: "12" } });
    fireEvent.change(within(summary).getByLabelText("Summary kind"), { target: { value: "change" } });
    fireEvent.click(within(summary).getByRole("button", { name: "Run test" }));
    await waitFor(() => expect(state.tests[1]).toEqual(["summary", "", 12, "change"]));
  });

  it("shows the server's reason when a test is refused", async () => {
    state.testError = new ApiError(429, "you have used your 30 test runs for the last 24 hours");
    show();
    const docs = await card("Docs generator");
    fireEvent.change(within(docs).getByLabelText(/Document id/), { target: { value: "5" } });
    fireEvent.click(within(docs).getByRole("button", { name: "Run test" }));
    expect((await within(docs).findByRole("alert")).textContent).toMatch(/30 test runs/);
  });
});
