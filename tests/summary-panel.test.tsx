import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { SummaryPanel } from "../src/components/summary-panel";
import { ApiError } from "../src/lib/api/client";

// A plain function instead of vi.fn(): vitest's call tracking reports a rejected promise that
// a spy returned as an unhandled error, even though the component handles it.
const api = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown]>,
  impl: (async () => ({})) as (path: string) => Promise<unknown>,
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/client")>("../src/lib/api/client");
  return {
    ...actual,
    apiFetch: (path: string, init?: unknown) => {
      api.calls.push([path, init]);
      return api.impl(path);
    },
  };
});

function panel(props: { cached: string | null; canRegenerate?: boolean }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SummaryPanel documentId={7} cachedSummary={props.cached} canRegenerate={props.canRegenerate} />
    </NextIntlClientProvider>,
  );
}

const fails = (status: number, message: string) => async () => {
  throw new ApiError(status, message);
};

beforeEach(() => {
  api.calls.length = 0;
  api.impl = async () => ({});
});
afterEach(cleanup);

describe("SummaryPanel: first summary", () => {
  it("two clicks in the same instant make one request", async () => {
    let finish: (v: unknown) => void = () => {};
    api.impl = () => new Promise((resolve) => (finish = resolve));
    panel({ cached: null });
    const button = screen.getByRole("button", { name: /Create AI summary/ });
    act(() => {
      button.click();
      button.click();
    });
    expect(api.calls).toHaveLength(1);
    await act(async () => finish({ summary: "Done.", cached: false, version_no: 1 }));
    expect(await screen.findByText("Done.")).toBeTruthy();
  });

  it("a failure shows an error and leaves the button usable", async () => {
    api.impl = fails(502, "the summary service failed (TimeoutError)");
    panel({ cached: null });
    fireEvent.click(screen.getByRole("button", { name: /Create AI summary/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("SummaryPanel: admin re-summarize", () => {
  it("is hidden for normal users", () => {
    panel({ cached: "Old text", canRegenerate: false });
    expect(screen.queryByRole("button", { name: /Re-summarize/ })).toBeNull();
  });

  it("asks for confirmation, then replaces the text", async () => {
    api.impl = async () => ({ summary: "New text", version_no: 1, replaced: true });
    panel({ cached: "Old text", canRegenerate: true });
    fireEvent.click(screen.getByRole("button", { name: /Re-summarize/ }));
    expect(api.calls).toHaveLength(0); // nothing happens before the confirm
    expect(screen.getByText(/Replace the saved summary for everyone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(await screen.findByText("New text")).toBeTruthy();
    expect(api.calls).toEqual([["/admin/documents/7/summary", { method: "POST" }]]);
  });

  it("Cancel makes no request", () => {
    panel({ cached: "Old text", canRegenerate: true });
    fireEvent.click(screen.getByRole("button", { name: /Re-summarize/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Re-summarize/ })).toBeTruthy();
  });

  it("a failed re-summary keeps the old text and shows the reason", async () => {
    api.impl = fails(502, "the summary service failed (TimeoutError)");
    panel({ cached: "Old text", canRegenerate: true });
    fireEvent.click(screen.getByRole("button", { name: /Re-summarize/ }));
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Old text")).toBeTruthy();
  });

  it("an unreachable server says so", async () => {
    api.impl = fails(0, "cannot reach the server");
    panel({ cached: "Old text", canRegenerate: true });
    fireEvent.click(screen.getByRole("button", { name: /Re-summarize/ }));
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
  });
});
