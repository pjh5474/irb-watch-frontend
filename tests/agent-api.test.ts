import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/client";
import { pageHintFor, parseSse, streamAnswer, type StreamEvent } from "../src/lib/api/agent";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok-1" } } }),
      signOut: async () => {},
    },
  }),
}));
vi.mock("@/lib/api/status", () => ({ reportReachable: () => {}, reportUnreachable: () => {} }));

const sse = (kind: string, data: unknown) => `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;

describe("parseSse", () => {
  it("reads every kind of event", () => {
    const text =
      sse("text", { delta: "Hel" }) +
      sse("tool", { name: "get_document" }) +
      sse("action", { id: "a1", kind: "scan_all" }) +
      sse("done", { message_id: 7 }) +
      sse("error", { message: "boom" });
    const { events, rest } = parseSse(text);
    expect(rest).toBe("");
    expect(events).toEqual([
      { kind: "text", delta: "Hel" },
      { kind: "tool", name: "get_document" },
      { kind: "action", action: { id: "a1", kind: "scan_all" } },
      { kind: "done", messageId: 7 },
      { kind: "error", message: "boom" },
    ]);
  });

  it("keeps an unfinished event for the next chunk", () => {
    const whole = sse("text", { delta: "Hello" });
    const first = parseSse(whole.slice(0, 20));
    expect(first.events).toEqual([]);
    const second = parseSse(first.rest + whole.slice(20));
    expect(second.events).toEqual([{ kind: "text", delta: "Hello" }]);
  });

  it("accepts Windows line endings", () => {
    expect(parseSse('event: text\r\ndata: {"delta":"a"}\r\n\r\n').events).toEqual([{ kind: "text", delta: "a" }]);
  });

  it("skips unknown events, broken JSON and events of the wrong shape", () => {
    const text =
      sse("mystery", { x: 1 }) +
      "event: text\ndata: {not json}\n\n" +
      sse("text", { delta: 5 }) +
      sse("done", { message_id: "7" }) +
      sse("text", { delta: "ok" });
    expect(parseSse(text).events).toEqual([{ kind: "text", delta: "ok" }]);
  });

  it("keeps text that contains line breaks and unicode intact", () => {
    const delta = "첫 줄\n둘째 줄 — \"quoted\"";
    expect(parseSse(sse("text", { delta })).events).toEqual([{ kind: "text", delta }]);
  });
});

describe("pageHintFor", () => {
  it("reads a document or source page from the address", () => {
    expect(pageHintFor("/documents/12")).toEqual({ kind: "document", id: 12 });
    expect(pageHintFor("/sources/5")).toEqual({ kind: "source", id: 5 });
    expect(pageHintFor("/admin/sources/5")).toEqual({ kind: "source", id: 5 });
    expect(pageHintFor("/sources/5/")).toEqual({ kind: "source", id: 5 });
  });

  it("returns nothing for other pages", () => {
    for (const path of ["/", "/sources", "/settings", "/admin/sources", "/documents/abc", "/documents/1/extra", "/admin/assistant"]) {
      expect(pageHintFor(path)).toBeNull();
    }
  });
});

describe("streamAnswer", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function streamOf(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  it("sends the token and the page hint, and delivers events split across chunks", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const whole = sse("text", { delta: "Hello" }) + sse("done", { message_id: 3 });
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return streamOf([whole.slice(0, 15), whole.slice(15, 60), whole.slice(60)]);
    }) as typeof fetch;

    const events: StreamEvent[] = [];
    await streamAnswer("c-1", { content: "hi", page: { kind: "document", id: 9 } }, (e) => events.push(e));
    expect(events).toEqual([
      { kind: "text", delta: "Hello" },
      { kind: "done", messageId: 3 },
    ]);
    expect(calls[0].url).toBe("https://api.test/agent/conversations/c-1/messages");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ content: "hi", page: { kind: "document", id: 9 } });
  });

  it("leaves the page out when there is no hint", async () => {
    let body = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return streamOf([]);
    }) as typeof fetch;
    await streamAnswer("c-1", { content: "hi", page: null }, () => {});
    expect(JSON.parse(body)).toEqual({ content: "hi" });
  });

  it("throws the server's reason for a refusal before the stream", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "you have used your 30 assistant messages" }), { status: 429 })) as typeof fetch;
    await expect(streamAnswer("c-1", { content: "hi" }, () => {})).rejects.toMatchObject({
      status: 429,
      message: "you have used your 30 assistant messages",
    });
  });

  it("does not treat a 403 as the end of the session: it is a reason to show", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "the assistant is switched off for your account type" }), { status: 403 })) as typeof fetch;
    const error = await streamAnswer("c-1", { content: "hi" }, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/switched off/);
  });

  it("reports no answer at all as status 0", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    await expect(streamAnswer("c-1", { content: "hi" }, () => {})).rejects.toMatchObject({ status: 0 });
  });

  it("passes an abort through as the abort, not as a server problem", async () => {
    const controller = new AbortController();
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      controller.abort();
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return streamOf([]);
    }) as typeof fetch;
    const error = await streamAnswer("c-1", { content: "hi" }, () => {}, controller.signal).catch((e) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(controller.signal.aborted).toBe(true);
  });
});
