import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../src/lib/api/client";
import { API_REACHABLE, API_UNREACHABLE } from "../src/lib/api/status";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      signOut: async () => {},
    },
  }),
}));

function listen(name: string) {
  const calls: string[] = [];
  const handler = () => calls.push(name);
  window.addEventListener(name, handler);
  return { calls, stop: () => window.removeEventListener(name, handler) };
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch status reporting", () => {
  it("a call with no answer becomes ApiError status 0 and reports 'unreachable'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const down = listen(API_UNREACHABLE);
    const up = listen(API_REACHABLE);
    await expect(apiFetch("/x", { method: "POST" })).rejects.toMatchObject({
      constructor: ApiError,
      status: 0,
    });
    expect(down.calls).toHaveLength(1);
    expect(up.calls).toHaveLength(0);
    down.stop();
    up.stop();
  });

  it("any HTTP answer, even an error, reports 'reachable'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "slow down" }), { status: 429 })),
    );
    const down = listen(API_UNREACHABLE);
    const up = listen(API_REACHABLE);
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 429, message: "slow down" });
    expect(up.calls).toHaveLength(1);
    expect(down.calls).toHaveLength(0);
    down.stop();
    up.stop();
  });
});
