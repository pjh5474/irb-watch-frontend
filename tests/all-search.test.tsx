import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { AllSearch } from "../src/components/admin/all-search";
import type { AllSearchJob, AllSearchPreview } from "../src/lib/api/calendar";
import { ApiError } from "../src/lib/api/client";

const state = {
  jobs: [] as AllSearchJob[],
  preview: null as AllSearchPreview | null,
  readError: null as Error | null,
  calls: [] as unknown[][],
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/lib/api/calendar", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/calendar")>("../src/lib/api/calendar");
  return {
    ...actual,
    allSearchApi: {
      jobs: async () => state.jobs,
      read: async (...args: unknown[]) => {
        state.calls.push(["read", ...args]);
        if (state.readError) throw state.readError;
        return state.jobs[0];
      },
      preview: async () => state.preview,
      ai: async (...args: unknown[]) => {
        state.calls.push(["ai", ...args]);
        return state.jobs[0];
      },
      stop: async (...args: unknown[]) => {
        state.calls.push(["stop", ...args]);
        return state.jobs[0];
      },
    },
  };
});

const job = (over: Partial<AllSearchJob> = {}): AllSearchJob => ({
  id: "j1",
  hospital_id: 7,
  stage: "read",
  status: "done",
  stop_requested: false,
  error: null,
  progress: {},
  created_at: "2026-11-18T09:00:00+00:00",
  started_at: null,
  finished_at: null,
  ...over,
});

function wrap(messages: typeof en = en, locale = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AllSearch hospitalId={7} name="Gachon" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.jobs = [];
  state.preview = null;
  state.readError = null;
  state.calls = [];
});
afterEach(cleanup);

describe("AllSearch", () => {
  it("starts the read and shows a failure's reason instead of looking like nothing happened", async () => {
    state.readError = new ApiError(409, "scan these boards once first");
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Read all posts" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(state.calls[0]).toEqual(["read", 7]);
  });

  it("shows each board's progress and a job's own reason, and offers Stop while it runs", async () => {
    state.jobs = [
      job({
        status: "running",
        progress: {
          boards: {
            "1": { name: "Gachon : notices", stored: 120, total: 130, left: 40, failed: 1, flagged: 3, state: "reading", error: null },
            "2": { name: "Gachon : forms", stored: 0, total: 0, left: null, failed: 0, flagged: 0, state: "failed", error: "login rejected" },
          },
        },
      }),
    ];
    wrap();
    expect(await screen.findByText("Gachon : notices")).toBeTruthy();
    expect(screen.getByText(/120 \(130\)/)).toBeTruthy();
    expect(screen.getByText(/login rejected/)).toBeTruthy();
    // While a job is open: no second read, a Stop button.
    expect((screen.getByRole("button", { name: "Read all posts" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(state.calls.at(-1)).toEqual(["stop", "j1"]));
  });

  it("shows the AI step's size first and starts it only after the confirm button", async () => {
    state.preview = { stored_posts: 300, posts: 40, chars: 250000, batches: 5, run_batches: 5, left_over: 0, enabled: true };
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Check what the AI would read" }));
    expect(await screen.findByText(/300 stored posts.*40 of them.*250,000 characters.*5 call/)).toBeTruthy();
    expect(state.calls).toEqual([]); // nothing was spent yet
    fireEvent.click(screen.getByRole("button", { name: "Start the AI search (5 call(s))" }));
    await waitFor(() => expect(state.calls[0]).toEqual(["ai", 7]));
  });

  it("says when the AI has nothing left to read and keeps the confirm button away", async () => {
    state.preview = { stored_posts: 10, posts: 0, chars: 0, batches: 0, run_batches: 0, left_over: 0, enabled: true };
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Check what the AI would read" }));
    expect(await screen.findByText(/none is left for the AI to read/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start the AI search/ })).toBeNull();
  });

  it("has Korean texts for every key it uses", async () => {
    state.jobs = [job({ stage: "ai", progress: { batches: 3, batches_done: 1, proposed: 2 } })];
    wrap(ko as unknown as typeof en, "ko");
    expect(await screen.findByText("전체 검색: Gachon")).toBeTruthy();
    expect(await screen.findByText(/3번 중 1번, 제안 2건/)).toBeTruthy();
  });
});
