import { ApiError, apiFetch } from "@/lib/api/client";
import { reportReachable, reportUnreachable } from "@/lib/api/status";
import { createClient } from "@/lib/supabase/client";

// The assistant's routes. Typed by hand until `npm run gen:api-types` is run against a backend
// that has them.

export type Conversation = { id: string; title: string; created_at: string; updated_at: string };

export type ActionKind = "scan_source" | "scan_all" | "resummarize" | "test_mail" | "weekly_preview";

// A proposal from the assistant. It does nothing by itself: an admin must click Confirm, which
// runs the normal admin route with the admin's own login. `name` is the source name or the
// document title as the server read it (plain text, never HTML).
export type ActionCard = {
  id: string;
  kind: ActionKind;
  source_id?: number;
  document_id?: number;
  name?: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions: ActionCard[];
  created_at: string;
};

export type AgentStatus = { enabled: boolean; used: number; limit: number; reason: string | null };

export type AgentLimits = { user_daily_limit: number; admin_daily_limit: number };

export type PageHint = { kind: "source" | "document"; id: number };

export const agentApi = {
  status: () => apiFetch<AgentStatus>("/agent/status"),
  conversations: () => apiFetch<Conversation[]>("/agent/conversations"),
  createConversation: () => apiFetch<Conversation>("/agent/conversations", { method: "POST" }),
  messages: (id: string) => apiFetch<ChatMessage[]>(`/agent/conversations/${id}/messages`),
  deleteConversation: (id: string) =>
    apiFetch<void>(`/agent/conversations/${id}`, { method: "DELETE" }),
  limits: () => apiFetch<AgentLimits>("/admin/agent/settings"),
  saveLimits: (body: AgentLimits) =>
    apiFetch<AgentLimits>("/admin/agent/settings", { method: "PUT", body: JSON.stringify(body) }),
};

// ---- the page the user is looking at --------------------------------------------------------

/** The source or document page the user has open, read from the address (without the language). */
export function pageHintFor(pathname: string): PageHint | null {
  const doc = /^\/documents\/(\d+)\/?$/.exec(pathname);
  if (doc) return { kind: "document", id: Number(doc[1]) };
  const source = /^\/(?:admin\/)?sources\/(\d+)\/?$/.exec(pathname);
  if (source) return { kind: "source", id: Number(source[1]) };
  return null;
}

// ---- the streamed answer ---------------------------------------------------------------------

export type StreamEvent =
  | { kind: "text"; delta: string }
  | { kind: "tool"; name: string }
  | { kind: "action"; action: ActionCard }
  | { kind: "done"; messageId: number }
  | { kind: "error"; message: string };

/**
 * Splits a buffer of server-sent events into complete events and the unfinished rest.
 * Events end with a blank line; an unknown event name or broken JSON is skipped, not fatal.
 */
export function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let name = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) name = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (!name || !data) continue;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (name === "text" && typeof body.delta === "string") events.push({ kind: "text", delta: body.delta });
    else if (name === "tool" && typeof body.name === "string") events.push({ kind: "tool", name: body.name });
    else if (name === "action" && typeof body.id === "string") events.push({ kind: "action", action: body as unknown as ActionCard });
    else if (name === "done" && typeof body.message_id === "number") events.push({ kind: "done", messageId: body.message_id });
    else if (name === "error" && typeof body.message === "string") events.push({ kind: "error", message: body.message });
  }
  return { events, rest };
}

/**
 * Sends a message and calls `onEvent` for every event as it arrives. Refusals before the stream
 * (limit, size, ownership, switched off) are thrown as ApiError with the server's reason. A
 * 401 signs the user out like every other call; a 403 here is a reason to show (the assistant is
 * switched off for the account type), not the end of the session, so it is not treated that way.
 */
export async function streamAnswer(
  conversationId: string,
  body: { content: string; page?: PageHint | null },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent/conversations/${conversationId}/messages`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        content: body.content,
        ...(body.page ? { page: { kind: body.page.kind, id: body.page.id } } : {}),
      }),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    reportUnreachable();
    throw new ApiError(0, "cannot reach the server");
  }
  reportReachable();

  if (response.status === 401) {
    await supabase.auth.signOut();
    const locale = window.location.pathname.split("/")[1] || "ko";
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/${locale}/login?reason=session`);
    throw new ApiError(401, "signed out");
  }
  if (!response.ok || !response.body) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      if (typeof json?.detail === "string") detail = json.detail;
    } catch {
      // not JSON
    }
    throw new ApiError(response.status, detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
  // The server ends every event with a blank line, so nothing meaningful is left in the buffer.
}
