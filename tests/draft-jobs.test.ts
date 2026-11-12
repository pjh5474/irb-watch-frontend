import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/client";
import { type DraftJob, docgenApi, isOpenJob, waitForJob } from "../src/lib/api/docgen";

// The server's answers, in order, per path.
const server = vi.hoisted(() => ({
  answers: new Map<string, unknown[]>(),
  calls: [] as string[],
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/client")>("../src/lib/api/client");
  return {
    ...actual,
    apiFetch: async (path: string, init?: RequestInit) => {
      server.calls.push(`${init?.method ?? "GET"} ${path}`);
      const queue = server.answers.get(path) ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    },
  };
});

const job = (status: DraftJob["status"], extra: Partial<DraftJob> = {}): DraftJob => ({
  id: "j1",
  kind: "draft",
  status,
  error: null,
  draft_id: null,
  pipeline_step_id: null,
  created_at: "2026-11-12T01:00:00Z",
  finished_at: null,
  ...extra,
});

beforeEach(() => {
  server.answers = new Map();
  server.calls = [];
});

describe("draft jobs", () => {
  it("knows which jobs are open", () => {
    expect([job("queued"), job("running"), job("done"), job("failed")].map(isOpenJob)).toEqual([true, true, false, false]);
  });

  it("waits until the job is done", async () => {
    server.answers.set("/docgen/jobs/j1", [job("running"), job("done", { draft_id: "d1" })]);
    const done = await waitForJob(job("queued"), 1);
    expect(done.draft_id).toBe("d1");
    expect(server.calls).toEqual(["GET /docgen/jobs/j1", "GET /docgen/jobs/j1"]);
  });

  it("a failed job is thrown with the server's reason, never returned as done", async () => {
    server.answers.set("/docgen/jobs/j1", [job("failed", { error: "the AI could not write the draft (TimeoutError); please try again" })]);
    const failure = await waitForJob(job("queued"), 1).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.message).toContain("TimeoutError");
  });

  it("a job that is already finished is not asked for again", async () => {
    await waitForJob(job("done", { draft_id: "d1" }), 1);
    expect(server.calls).toEqual([]);
  });

  it("create starts the job, waits and returns the new draft", async () => {
    vi.useFakeTimers();
    try {
      server.answers.set("/docgen/drafts", [job("queued")]);
      server.answers.set("/docgen/jobs/j1", [job("done", { draft_id: "d1" })]);
      server.answers.set("/docgen/drafts/d1", [{ draft: { id: "d1" }, versions: [], guides: [] }]);
      const result = docgenApi.create({ documents: [], guide_ids: null, extra_guides: [], instruction: "", ai_override_source_ids: [] });
      await vi.advanceTimersByTimeAsync(2_500);
      expect((await result).draft.id).toBe("d1");
      expect(server.calls).toEqual(["POST /docgen/drafts", "GET /docgen/jobs/j1", "GET /docgen/drafts/d1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a refusal at the start is thrown at once (no waiting)", async () => {
    server.answers.set("/docgen/drafts", [new ApiError(409, "AI is off for: Study")]);
    await expect(
      docgenApi.create({ documents: [], guide_ids: null, extra_guides: [], instruction: "", ai_override_source_ids: [] }),
    ).rejects.toThrow("AI is off for: Study");
    expect(server.calls).toEqual(["POST /docgen/drafts"]);
  });

  it("revise waits for its job and returns the newest version", async () => {
    vi.useFakeTimers();
    try {
      server.answers.set("/docgen/drafts/d1/revise", [job("running", { kind: "revision", draft_id: "d1" })]);
      server.answers.set("/docgen/jobs/j1", [job("done", { kind: "revision", draft_id: "d1" })]);
      server.answers.set("/docgen/drafts/d1", [{ draft: { id: "d1" }, versions: [{ version_no: 1 }, { version_no: 2 }], guides: [] }]);
      const result = docgenApi.revise("d1", "shorter");
      await vi.advanceTimersByTimeAsync(2_500);
      expect((await result).version_no).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
