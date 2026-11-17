import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TYPING_PAUSE_MS, useStepAutosave } from "../src/lib/use-step-autosave";

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  // Each call waits for the test to settle it, so "while it is saving" can be looked at.
  waiting: [] as { resolve: () => void; reject: (e: Error) => void }[],
  auto: true,
}));

vi.mock("@/lib/api/pipelines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api/pipelines")>();
  return {
    ...actual,
    pipelineApi: {
      ...actual.pipelineApi,
      updateStep: (id: number, stepId: number, change: unknown) => {
        state.calls.push([id, stepId, change]);
        if (state.auto) return Promise.resolve({});
        return new Promise((resolve, reject) => state.waiting.push({ resolve: () => resolve({}), reject }));
      },
    },
  };
});

function Harness({ initial = { status_key: "not_started" } }: { initial?: { status_key: string } }) {
  const [server, setServer] = useState(initial);
  const [typed, setTyped] = useState("");
  const save = useStepAutosave(9, 21, server, (e) => (e instanceof Error ? e.message : "?"));
  return (
    <div>
      <span data-testid="shown">{save.value("status_key", server.status_key)}</span>
      <span data-testid="phase">{save.phase}</span>
      <span data-testid="error">{save.error ?? ""}</span>
      <button onClick={() => save.pick({ status_key: "submitted" })}>pick submitted</button>
      <button onClick={() => save.pick({ status_key: "approved" })}>pick approved</button>
      <button onClick={() => setServer({ status_key: "submitted" })}>server reloads</button>
      <input
        aria-label="subject"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          save.type({ subject: e.target.value });
        }}
        onBlur={save.flush}
      />
      <span data-testid="typed">{typed}</span>
      <button onClick={save.flush}>retry</button>
      <button onClick={() => save.discard(() => setTyped(""))}>discard</button>
    </div>
  );
}

function show(ui = <Harness />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const text = (id: string) => screen.getByTestId(id).textContent;
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  state.calls = [];
  state.waiting = [];
  state.auto = true;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("step auto-save", () => {
  it("shows a picked value at once and saves it at once", async () => {
    state.auto = false; // the server has not answered yet
    show();
    fireEvent.click(screen.getByText("pick submitted"));
    expect(text("shown")).toBe("submitted"); // not waiting for the server
    expect(text("phase")).toBe("saving");
    expect(state.calls).toEqual([[9, 21, { status_key: "submitted" }]]);
    await act(async () => state.waiting[0].resolve());
    expect(text("phase")).toBe("saved");
    expect(text("shown")).toBe("submitted"); // until the page has reloaded
  });

  it("drops the picked value once the page has reloaded with the server's copy", async () => {
    show();
    fireEvent.click(screen.getByText("pick approved"));
    await settle();
    expect(text("shown")).toBe("approved"); // saved, the page has not reloaded yet
    fireEvent.click(screen.getByText("server reloads")); // the reload brings "submitted"
    expect(text("shown")).toBe("submitted"); // the server's copy is shown again
    expect(text("phase")).toBe("saved");
  });

  it("saves typed text about a second after the user stops typing, and every key moves the pause", async () => {
    show();
    const box = screen.getByLabelText("subject");
    fireEvent.change(box, { target: { value: "P" } });
    await act(async () => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS - 100));
    fireEvent.change(box, { target: { value: "PT" } });
    await act(async () => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS - 100));
    expect(state.calls).toEqual([]); // still typing
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(state.calls).toEqual([[9, 21, { subject: "PT" }]]);
  });

  it("leaving the field saves the text at once", async () => {
    show();
    const box = screen.getByLabelText("subject");
    fireEvent.change(box, { target: { value: "PT 2.0" } });
    fireEvent.blur(box);
    expect(state.calls).toEqual([[9, 21, { subject: "PT 2.0" }]]);
    await act(async () => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS * 2));
    expect(state.calls.length).toBe(1); // the pause timer was cleared, nothing is sent twice
  });

  it("changes that come while a save runs go out together right after it", async () => {
    state.auto = false;
    show();
    fireEvent.click(screen.getByText("pick submitted"));
    fireEvent.change(screen.getByLabelText("subject"), { target: { value: "A" } });
    fireEvent.blur(screen.getByLabelText("subject"));
    fireEvent.click(screen.getByText("pick approved"));
    expect(state.calls).toEqual([[9, 21, { status_key: "submitted" }]]); // one save at a time
    await act(async () => state.waiting[0].resolve());
    expect(state.calls[1]).toEqual([9, 21, { subject: "A", status_key: "approved" }]);
    expect(text("shown")).toBe("approved");
    await act(async () => state.waiting[1].resolve());
    expect(text("phase")).toBe("saved");
  });

  it("a failed save says why, keeps the value on screen and sends it again on retry", async () => {
    state.auto = false;
    show();
    fireEvent.click(screen.getByText("pick submitted"));
    await act(async () => state.waiting[0].reject(new Error("the server said no")));
    expect(text("phase")).toBe("failed");
    expect(text("error")).toBe("the server said no");
    expect(text("shown")).toBe("submitted"); // a failure never looks like no change
    fireEvent.click(screen.getByText("retry"));
    expect(state.calls[1]).toEqual([9, 21, { status_key: "submitted" }]);
    await act(async () => state.waiting[1].resolve());
    expect(text("phase")).toBe("saved");
    expect(text("error")).toBe("");
  });

  it("a newer value of the same field wins over a failed older one", async () => {
    state.auto = false;
    show();
    fireEvent.click(screen.getByText("pick submitted"));
    fireEvent.click(screen.getByText("pick approved")); // waits behind the first save
    await act(async () => state.waiting[0].reject(new Error("down")));
    fireEvent.click(screen.getByText("retry"));
    expect(state.calls[1]).toEqual([9, 21, { status_key: "approved" }]);
  });

  it("discarding drops what was not saved and resets the typed fields", async () => {
    state.auto = false;
    show();
    fireEvent.change(screen.getByLabelText("subject"), { target: { value: "lost" } });
    fireEvent.click(screen.getByText("pick submitted"));
    await act(async () => state.waiting[0].reject(new Error("down")));
    fireEvent.click(screen.getByText("discard"));
    expect(text("shown")).toBe("not_started");
    expect(text("typed")).toBe("");
    expect(text("phase")).toBe("idle");
    await act(async () => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS * 2));
    expect(state.calls.length).toBe(1); // nothing is sent after a discard
  });

  it("leaving the page sends the text that is still waiting", async () => {
    const view = show();
    fireEvent.change(screen.getByLabelText("subject"), { target: { value: "last words" } });
    expect(state.calls).toEqual([]);
    view.unmount();
    expect(state.calls).toEqual([[9, 21, { subject: "last words" }]]);
  });

  it("closing the tab asks first while something is not saved, and never when all is saved", async () => {
    state.auto = false;
    show();
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(closing()).toBe(false);
    fireEvent.change(screen.getByLabelText("subject"), { target: { value: "x" } });
    expect(closing()).toBe(true); // typed, not sent yet
    fireEvent.blur(screen.getByLabelText("subject"));
    expect(closing()).toBe(true); // sending
    await act(async () => state.waiting[0].resolve());
    expect(closing()).toBe(false);
  });
});
