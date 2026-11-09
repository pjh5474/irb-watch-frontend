import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AssistantPanel } from "../src/components/assistant/assistant-panel";
import { ApiError } from "../src/lib/api/client";
import type { ActionCard, ChatMessage, StreamEvent } from "../src/lib/api/agent";

// A stand-in for the server: it keeps conversations and messages, and "answers" by running a
// script. Plain functions, because vitest reports a rejected spy promise as unhandled.
type Script = {
  answer: string;
  tools: string[];
  actions: ActionCard[];
  eventError: string | null;
  preStreamError: Error | null;
  waitForAbort: boolean;
};

const api = vi.hoisted(() => ({
  pathname: "/",
  status: { enabled: true, used: 3, limit: 30, reason: null as string | null },
  conversations: [] as Array<{ id: string; title: string; created_at: string; updated_at: string }>,
  messages: {} as Record<string, unknown[]>,
  sent: [] as Array<{ id: string; body: unknown }>,
  calls: [] as Array<[string, ...unknown[]]>,
  nextMessageId: 1,
  deleted: [] as string[],
  actionError: null as unknown,
  script: null as unknown,
}));

const script = () => api.script as Script;

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => api.pathname,
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    scanSource: async (...a: unknown[]) => {
      api.calls.push(["scanSource", ...a]);
      if (api.actionError) throw api.actionError;
    },
    scanAll: async () => {
      api.calls.push(["scanAll"]);
    },
    resummarize: async (...a: unknown[]) => {
      api.calls.push(["resummarize", ...a]);
    },
    sendTestMail: async () => {
      api.calls.push(["sendTestMail"]);
    },
    sendWeeklyPreview: async () => {
      api.calls.push(["sendWeeklyPreview"]);
    },
  },
}));

vi.mock("@/lib/api/agent", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/agent")>("../src/lib/api/agent");
  const at = "2026-11-10T00:00:00+00:00";
  return {
    ...actual,
    agentApi: {
      status: async () => api.status,
      conversations: async () => api.conversations,
      createConversation: async () => {
        const c = { id: `c-${api.conversations.length + 1}`, title: "", created_at: at, updated_at: at };
        api.conversations.push(c);
        api.messages[c.id] = [];
        api.calls.push(["createConversation"]);
        return c;
      },
      messages: async (id: string) => api.messages[id] ?? [],
      deleteConversation: async (id: string) => {
        api.deleted.push(id);
        api.conversations = api.conversations.filter((c) => c.id !== id);
      },
    },
    streamAnswer: async (
      id: string,
      body: { content: string },
      onEvent: (e: StreamEvent) => void,
      signal?: AbortSignal,
    ) => {
      const s = script();
      api.sent.push({ id, body });
      if (s.preStreamError) throw s.preStreamError;
      // The server saves the question before it answers.
      const list = api.messages[id] as unknown[];
      list.push({ id: api.nextMessageId++, role: "user", content: body.content, actions: [], created_at: at });
      const conv = api.conversations.find((c) => c.id === id);
      if (conv && !conv.title) conv.title = body.content;
      for (const name of s.tools) onEvent({ kind: "tool", name });
      if (s.answer) for (const word of s.answer.split(" ")) onEvent({ kind: "text", delta: `${word} ` });
      for (const action of s.actions) onEvent({ kind: "action", action });
      if (s.waitForAbort) {
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
        throw new DOMException("aborted", "AbortError");
      }
      if (s.eventError) {
        onEvent({ kind: "error", message: s.eventError });
        return;
      }
      const messageId = api.nextMessageId++;
      list.push({ id: messageId, role: "assistant", content: s.answer, actions: s.actions, created_at: at });
      onEvent({ kind: "done", messageId });
    },
  };
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <AssistantPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
const box = () => screen.getByLabelText("Type a question") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Send" });
const ask = (text: string) => {
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.click(sendButton());
};

const SCAN: ActionCard = { id: "act-1", kind: "scan_source", source_id: 4, name: "Board A" };

beforeEach(() => {
  api.pathname = "/";
  api.status = { enabled: true, used: 3, limit: 30, reason: null };
  api.conversations = [];
  api.messages = {};
  api.sent = [];
  api.calls = [];
  api.nextMessageId = 1;
  api.deleted = [];
  api.actionError = null;
  api.script = { answer: "It is Board A", tools: [], actions: [], eventError: null, preStreamError: null, waitForAbort: false } satisfies Script;
});
afterEach(cleanup);

describe("opening", () => {
  it("asks the server nothing until it is opened", async () => {
    show();
    expect(screen.getByRole("button", { name: "Ask the assistant" })).toBeTruthy();
    expect(api.calls).toEqual([]);
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull(); // hidden
  });

  it("shows the introduction and the usage when opened", async () => {
    show();
    openPanel();
    expect(await screen.findByText(/Ask about the documents you can read/)).toBeTruthy();
    expect(await screen.findByText("3 of 30 messages used in the last 24 hours")).toBeTruthy();
  });

  it("closes with the button and with Escape", async () => {
    show();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close the assistant" }));
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
    openPanel();
    expect(screen.getByRole("complementary", { name: "Assistant" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
  });
});

describe("asking", () => {
  it("creates a conversation, streams the answer and shows the saved messages once", async () => {
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("What changed?");
    expect(await screen.findByText("It is Board A")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("status", { name: "" })).toBeNull());
    expect(screen.getAllByText("What changed?")).toHaveLength(1); // not drawn twice
    expect(screen.getAllByText("It is Board A")).toHaveLength(1);
    expect(api.calls.filter((c) => c[0] === "createConversation")).toHaveLength(1);
    expect(api.sent).toEqual([{ id: "c-1", body: { content: "What changed?", page: null } }]);
    expect(box().value).toBe("");
  });

  it("keeps using the same conversation for the next question", async () => {
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("One");
    await screen.findByText("It is Board A");
    ask("Two");
    await waitFor(() => expect(api.sent).toHaveLength(2));
    expect(api.sent[1].id).toBe("c-1");
    expect(api.calls.filter((c) => c[0] === "createConversation")).toHaveLength(1);
  });

  it("Enter sends, Shift+Enter does not, and a character still being composed does not", async () => {
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    fireEvent.change(box(), { target: { value: "한글" } });
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    expect(api.sent).toHaveLength(0);
    fireEvent.keyDown(box(), { key: "Enter" });
    await waitFor(() => expect(api.sent).toHaveLength(1));
  });

  it("does not send an empty or blank question", async () => {
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "   " } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("two Enter presses in the same instant send one message", async () => {
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    fireEvent.change(box(), { target: { value: "hi" } });
    act(() => {
      fireEvent.keyDown(box(), { key: "Enter" });
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    await screen.findByText("It is Board A");
    expect(api.sent).toHaveLength(1);
  });

  it("shows what the assistant is looking up while it works", async () => {
    (api.script as Script).tools = ["get_document"];
    (api.script as Script).answer = ""; // a lookup comes before any answer text
    (api.script as Script).waitForAbort = true;
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Read it");
    expect(await screen.findByText("Reading a document...")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByText(/Stopped/);
  });

  it("locks the input while the answer is written and unlocks and refocuses it afterwards", async () => {
    (api.script as Script).waitForAbort = true;
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Slow one");
    await screen.findByRole("button", { name: "Stop" });
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toBe("Waiting for the answer...");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByText(/Stopped/);
    await waitFor(() => expect(box().disabled).toBe(false));
    expect(box().placeholder).toBe("Type a question");
    expect(document.activeElement).toBe(box());
  });

  it("Stop ends the wait, keeps the saved question and says so", async () => {
    (api.script as Script).waitForAbort = true;
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Slow one");
    const stop = await screen.findByRole("button", { name: "Stop" });
    fireEvent.click(stop);
    expect(await screen.findByText(/Stopped\. The question was saved/)).toBeTruthy();
    expect(screen.getAllByText("Slow one")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy(); // ready again
  });
});

describe("failures show a reason", () => {
  it("shows the server's reason for a refusal such as the daily limit", async () => {
    (api.script as Script).preStreamError = new ApiError(429, "you have used your 30 assistant messages for the last 24 hours");
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Too many");
    expect(await screen.findByText(/you have used your 30 assistant messages/)).toBeTruthy();
  });

  it("says the server cannot be reached", async () => {
    (api.script as Script).preStreamError = new ApiError(0, "cannot reach the server");
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Hello?");
    expect(await screen.findByText("Cannot reach the server. Try again in a moment.")).toBeTruthy();
  });

  it("shows the reason sent in an error event after the answer started, and drops the half answer", async () => {
    (api.script as Script).eventError = "the assistant failed (RuntimeError)";
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Break");
    expect(await screen.findByText("the assistant failed (RuntimeError)")).toBeTruthy();
    expect(screen.queryByText(/It is Board A/)).toBeNull();
    expect(screen.getAllByText("Break")).toHaveLength(1);
  });

  it("is switched off, with the reason, when the server says it is unavailable", async () => {
    api.status = { enabled: false, used: 0, limit: 0, reason: "the assistant is switched off for your account type" };
    show();
    openPanel();
    expect(await screen.findByText(/The assistant is not available/)).toBeTruthy();
    expect(screen.getByText(/switched off for your account type/)).toBeTruthy();
    expect(box().disabled).toBe(true);
  });
});

describe("page hint", () => {
  it("shows a removable chip for a document page and sends the page", async () => {
    api.pathname = "/documents/12";
    document.body.insertAdjacentHTML("beforeend", "<main><h1>Consent form v2</h1></main>");
    show();
    openPanel();
    expect(await screen.findByText(/Asking about document #12/)).toBeTruthy();
    await screen.findByText(/Consent form v2/);
    ask("Summarise this");
    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(api.sent[0].body).toEqual({ content: "Summarise this", page: { kind: "document", id: 12 } });
    document.querySelector("main")?.remove();
  });

  it("sends nothing about the page once the chip is removed", async () => {
    api.pathname = "/sources/5";
    show();
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Do not use this page" }));
    expect(screen.queryByText(/Asking about/)).toBeNull();
    ask("Anything");
    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(api.sent[0].body).toEqual({ content: "Anything", page: null });
  });

  it("has no chip on other pages", async () => {
    api.pathname = "/settings";
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    expect(screen.queryByText(/Asking about/)).toBeNull();
  });
});

describe("conversations", () => {
  const at = "2026-11-10T00:00:00+00:00";

  it("lists them, opens one with its messages, and starts a new chat", async () => {
    api.conversations = [{ id: "c-9", title: "Old question", created_at: at, updated_at: at }];
    api.messages["c-9"] = [
      { id: 1, role: "user", content: "Old question", actions: [], created_at: at },
      { id: 2, role: "assistant", content: "Old answer", actions: [], created_at: at },
    ];
    show();
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Conversations" }));
    fireEvent.click(await screen.findByText("Old question"));
    expect(await screen.findByText("Old answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("Old answer")).toBeNull();
    expect(await screen.findByText(/Ask about the documents/)).toBeTruthy();
  });

  it("asks before deleting a conversation", async () => {
    api.conversations = [{ id: "c-9", title: "Old question", created_at: at, updated_at: at }];
    show();
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Conversations" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete this conversation" }));
    expect(api.deleted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(api.deleted).toEqual(["c-9"]));
    await waitFor(() => expect(screen.queryByText("Old question")).toBeNull());
  });

  it("says how long conversations are kept", async () => {
    show();
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Conversations" }));
    expect(await screen.findByText(/deleted automatically 30 days/)).toBeTruthy();
  });
});

describe("admin proposals", () => {
  async function proposeScan() {
    (api.script as Script).actions = [SCAN];
    (api.script as Script).answer = "I can scan it";
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Scan Board A");
    return await screen.findByRole("button", { name: "Confirm" });
  }

  it("shows a card that does nothing until Confirm, then runs the admin route once", async () => {
    const confirm = await proposeScan();
    expect(screen.getByText('Scan the source "Board A" now')).toBeTruthy();
    expect(api.calls.filter((c) => c[0] === "scanSource")).toHaveLength(0);
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(await screen.findByText("Done.")).toBeTruthy();
    expect(api.calls.filter((c) => c[0] === "scanSource")).toEqual([["scanSource", 4]]);
  });

  it("shows the server's reason when the confirmed action fails", async () => {
    api.actionError = new ApiError(409, "a scan of this source is already running");
    const confirm = await proposeScan();
    fireEvent.click(confirm);
    expect(await screen.findByText("a scan of this source is already running")).toBeTruthy();
  });

  it("Dismiss runs nothing", async () => {
    await proposeScan();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Dismissed.")).toBeTruthy();
    expect(api.calls.filter((c) => c[0] === "scanSource")).toHaveLength(0);
  });

  it("warns that a re-summary replaces the saved one for everyone", async () => {
    (api.script as Script).actions = [{ id: "act-2", kind: "resummarize", document_id: 9, source_id: 4, name: "Form A" }];
    show();
    openPanel();
    await screen.findByText(/Ask about the documents/);
    ask("Redo it");
    expect(await screen.findByText(/replaces the saved summary for everyone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.calls).toContainEqual(["resummarize", 9]));
  });

  it("a card loaded from the history is plain text with no Confirm button", async () => {
    const at = "2026-11-10T00:00:00+00:00";
    api.conversations = [{ id: "c-9", title: "Earlier", created_at: at, updated_at: at }];
    api.messages["c-9"] = [
      { id: 2, role: "assistant", content: "I can scan it", actions: [SCAN], created_at: at } satisfies Partial<ChatMessage>,
    ];
    show();
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Conversations" }));
    fireEvent.click(await screen.findByText("Earlier"));
    expect(await screen.findByText(/Suggested:/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("only the newest answer's cards can be clicked", async () => {
    const confirm = await proposeScan();
    expect(confirm).toBeTruthy();
    (api.script as Script).actions = [];
    ask("Thanks");
    await waitFor(() => expect(api.sent).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
    expect(within(screen.getByRole("complementary", { name: "Assistant" })).getByText(/Suggested:/)).toBeTruthy();
  });
});
