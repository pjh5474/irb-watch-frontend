"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, History, Plus, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionCardView, runAction, type ActionState } from "@/components/assistant/action-card";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePathname } from "@/i18n/navigation";
import {
  agentApi,
  pageHintFor,
  streamAnswer,
  type ActionCard,
  type ChatMessage,
  type StreamEvent,
} from "@/lib/api/agent";
import { ApiError } from "@/lib/api/client";
import { useSingleFlight } from "@/lib/use-single-flight";

const MAX_CHARS = 2000; // the server refuses longer messages

const STATUS_KEY = ["assistant", "status"] as const;
const LIST_KEY = ["assistant", "conversations"] as const;
const messagesKey = (id: string | null) => ["assistant", "messages", id] as const;

// The answer being written right now (not saved yet). `baseCount` is how many saved messages
// there were when the question was sent: once the list has more, the server has saved the
// question and it comes from the list, so it is not drawn twice.
type Pending = { question: string; answer: string; tool: string | null; baseCount: number };

const KNOWN_TOOLS = [
  "list_sources",
  "list_documents",
  "get_changes",
  "get_document",
  "get_document_text",
  "compare_versions",
  "propose_action",
];

export function AssistantPanel() {
  const t = useTranslations("assistant");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "list">("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Proposals from the live session: only the newest answer's cards can be clicked.
  const [liveMessageId, setLiveMessageId] = useState<number | null>(null);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  const [hintDismissedFor, setHintDismissedFor] = useState<string | null>(null);
  const [hintTitle, setHintTitle] = useState<string | null>(null);

  const send = useSingleFlight();
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const actionRuns = useRef(new Set<string>()); // one click per card, even in the same instant

  const status = useQuery({ queryKey: STATUS_KEY, queryFn: agentApi.status, enabled: open });
  const conversations = useQuery({ queryKey: LIST_KEY, queryFn: agentApi.conversations, enabled: open });
  const messages = useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: () => agentApi.messages(conversationId as string),
    enabled: open && conversationId !== null,
  });

  // The page the user is on. Only its kind and number are sent; the title shown is read from the
  // page itself and is for the user's eyes only.
  const hint = pageHintFor(pathname);
  const showHint = hint !== null && hintDismissedFor !== pathname;
  useEffect(() => {
    if (!open || !hint) return;
    const timer = setTimeout(() => {
      setHintTitle(document.querySelector("main h1")?.textContent?.trim() || null);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathname]);

  useEffect(() => {
    if (open && view === "chat") input.current?.focus();
  }, [open, view, conversationId]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages.data, pending?.answer, pending?.tool, error, view]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const failure = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError) {
        if (e.status === 0) return t("errors.unreachable");
        if (e.message) return e.message; // the server's reason, written for people
      }
      return t("errors.generic");
    },
    [t],
  );

  function startNewChat() {
    setConversationId(null);
    setView("chat");
    setPending(null);
    setError(null);
    setLiveMessageId(null);
  }

  function openConversation(id: string) {
    setConversationId(id);
    setView("chat");
    setPending(null);
    setError(null);
    setLiveMessageId(null);
  }

  async function remove(id: string) {
    setDeleting(null);
    try {
      await agentApi.deleteConversation(id);
      if (id === conversationId) startNewChat();
    } catch (e) {
      setError(failure(e));
    }
    await queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }

  async function submit() {
    const content = draft.trim();
    if (!content || content.length > MAX_CHARS) return;
    await send.run(async () => {
      setError(null);
      setDraft("");
      setPending({ question: content, answer: "", tool: null, baseCount: messages.data?.length ?? 0 });
      const controller = new AbortController();
      abort.current = controller;
      let id = conversationId;
      let finished = false;
      try {
        if (!id) {
          id = (await agentApi.createConversation()).id;
          setConversationId(id);
        }
        const onEvent = (event: StreamEvent) => {
          if (event.kind === "text") setPending((p) => (p ? { ...p, answer: p.answer + event.delta, tool: null } : p));
          else if (event.kind === "tool") setPending((p) => (p ? { ...p, tool: event.name } : p));
          else if (event.kind === "done") {
            finished = true;
            setLiveMessageId(event.messageId);
          } else if (event.kind === "error") setError(event.message);
        };
        await streamAnswer(
          id,
          { content, page: showHint ? hint : null },
          onEvent,
          controller.signal,
        );
        if (!finished && !controller.signal.aborted) setError((current) => current ?? t("errors.cutOff"));
      } catch (e) {
        if (controller.signal.aborted) setError(t("stopped"));
        else setError(failure(e));
      } finally {
        abort.current = null;
        // The question was saved by the server before it answered, so reload the history. A
        // direct fetch (not invalidate) so it also works for a conversation created a moment ago,
        // whose list nobody is watching yet; otherwise the question would blink out.
        if (id) {
          const loaded = id;
          try {
            await queryClient.fetchQuery({
              queryKey: messagesKey(loaded),
              queryFn: () => agentApi.messages(loaded),
              staleTime: 0,
            });
          } catch {
            // The list shows its own error once it is read; the answer on screen stays.
          }
        }
        setPending(null);
        void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      }
    });
  }

  async function confirm(action: ActionCard) {
    if (actionRuns.current.has(action.id)) return;
    actionRuns.current.add(action.id);
    setActionState((s) => ({ ...s, [action.id]: { status: "running" } }));
    try {
      await runAction(action);
      setActionState((s) => ({ ...s, [action.id]: { status: "done" } }));
    } catch (e) {
      setActionState((s) => ({ ...s, [action.id]: { status: "error", message: failure(e) } }));
    }
  }

  const unavailable = status.data ? !status.data.enabled : false;
  const list = conversations.data ?? [];
  const toolLabel = (name: string) => t(`tools.${KNOWN_TOOLS.includes(name) ? name : "other"}`);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className={`fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${open ? "hidden" : ""}`}
      >
        <Bot className="size-4" aria-hidden />
        {t("open")}
      </button>

      <aside
        id="assistant-panel"
        aria-label={t("title")}
        hidden={!open}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[28rem]"
      >
        <header className="flex items-center gap-1 border-b px-3 py-2">
          <Bot className="size-4 shrink-0" aria-hidden />
          <h2 className="mr-auto text-sm font-semibold">{t("title")}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("history")}
            aria-pressed={view === "list"}
            onClick={() => setView((v) => (v === "list" ? "chat" : "list"))}
          >
            <History aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("newChat")} onClick={startNewChat}>
            <Plus aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("close")} onClick={() => setOpen(false)}>
            <X aria-hidden />
          </Button>
        </header>

        {view === "list" ? (
          <div className="flex-1 overflow-y-auto p-3">
            <h3 className="mb-2 text-sm font-medium">{t("history")}</h3>
            {conversations.isLoading && <p className="text-sm opacity-70">{t("loading")}</p>}
            {conversations.isError && (
              <p role="alert" className="text-sm text-red-600">
                {failure(conversations.error)}
              </p>
            )}
            {conversations.data && list.length === 0 && <p className="text-sm opacity-70">{t("noChats")}</p>}
            <ul className="flex flex-col gap-2">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate font-medium">{c.title || t("untitled")}</span>
                    <span className="text-xs opacity-70">
                      {format.dateTime(new Date(c.updated_at), { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </button>
                  {deleting === c.id ? (
                    <span className="animate-open flex items-center gap-1 text-xs">
                      <Button size="xs" onClick={() => void remove(c.id)}>
                        {t("yes")}
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => setDeleting(null)}>
                        {t("no")}
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("delete")}
                      onClick={() => setDeleting(c.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs opacity-60">{t("retention")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3" aria-live="polite">
            {!conversationId && !pending && (
              <div className="flex flex-col gap-2 text-sm opacity-80">
                <p>{t("intro")}</p>
                <p className="text-xs">{t("introNote")}</p>
              </div>
            )}
            {messages.isError && (
              <p role="alert" className="text-sm text-red-600">
                {failure(messages.error)}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {(messages.data ?? []).map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  live={m.id === liveMessageId}
                  actionState={actionState}
                  onConfirm={(a) => void confirm(a)}
                  onDismiss={(a) => setActionState((s) => ({ ...s, [a.id]: { status: "dismissed" } }))}
                />
              ))}
              {pending && (
                <>
                  {(messages.data?.length ?? 0) <= pending.baseCount && (
                    <li className="self-end">
                      <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                        {pending.question}
                      </p>
                    </li>
                  )}
                  {(messages.data?.length ?? 0) < pending.baseCount + 2 && (
                    <li className="flex flex-col gap-1">
                      {pending.answer ? (
                        <div className="rounded-lg bg-muted px-3 py-2">
                          <MarkdownText>{pending.answer}</MarkdownText>
                        </div>
                      ) : null}
                      <p className="flex items-center gap-2 text-xs opacity-70" role="status">
                        <Spinner aria-hidden />
                        {pending.tool ? toolLabel(pending.tool) : t("thinking")}
                      </p>
                    </li>
                  )}
                </>
              )}
            </ul>
            {error && (
              <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </p>
            )}
            <div ref={bottom} />
          </div>
        )}

        <footer className="flex flex-col gap-2 border-t p-3">
          {unavailable && (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
              {t("off")} {status.data?.reason ? `(${status.data.reason})` : ""}
            </p>
          )}
          {status.isError && (
            <p role="alert" className="text-xs text-red-600">
              {failure(status.error)}
            </p>
          )}
          {showHint && hint && (
            <p className="flex items-center gap-1 self-start rounded bg-muted px-2 py-1 text-xs">
              <span>
                {t("aboutPage", { kind: t(`pageKind.${hint.kind}`), id: hint.id })}
                {hintTitle ? `: ${hintTitle}` : ""}
              </span>
              <button
                type="button"
                aria-label={t("removeHint")}
                onClick={() => setHintDismissedFor(pathname)}
                className="rounded p-0.5 hover:bg-background"
              >
                <X className="size-3" aria-hidden />
              </button>
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line. Not while an input method (Korean,
                // Japanese, Chinese) is still composing a character.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              maxLength={MAX_CHARS}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              disabled={unavailable}
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-neutral-100 dark:disabled:bg-neutral-800"
            />
            {send.busy ? (
              <Button type="button" size="icon" variant="outline" aria-label={t("stop")} onClick={() => abort.current?.abort()}>
                <Square aria-hidden />
              </Button>
            ) : (
              <Button type="submit" size="icon" aria-label={t("send")} disabled={unavailable || !draft.trim()}>
                <SendHorizontal aria-hidden />
              </Button>
            )}
          </form>
          <p className="flex justify-between text-xs opacity-60">
            <span>{status.data ? t("usage", { used: status.data.used, limit: status.data.limit }) : ""}</span>
            <span>{draft.length > MAX_CHARS - 200 ? `${draft.length}/${MAX_CHARS}` : t("aiNote")}</span>
          </p>
        </footer>
      </aside>
    </>
  );
}

function MessageRow({
  message,
  live,
  actionState,
  onConfirm,
  onDismiss,
}: {
  message: ChatMessage;
  live: boolean;
  actionState: Record<string, ActionState>;
  onConfirm: (a: ActionCard) => void;
  onDismiss: (a: ActionCard) => void;
}) {
  if (message.role === "user") {
    return (
      <li className="self-end">
        <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </p>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2">
      <div className="rounded-lg bg-muted px-3 py-2">
        <MarkdownText>{message.content}</MarkdownText>
      </div>
      {message.actions.map((action) => (
        <ActionCardView
          key={action.id}
          action={action}
          interactive={live}
          state={actionState[action.id] ?? { status: "idle" }}
          onConfirm={() => onConfirm(action)}
          onDismiss={() => onDismiss(action)}
        />
      ))}
    </li>
  );
}
