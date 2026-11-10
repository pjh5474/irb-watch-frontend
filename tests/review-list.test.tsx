import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { ReviewList, ReviewOkButton } from "../src/components/admin/review-list";
import { ApiError } from "../src/lib/api/client";
import type { ReviewItem } from "../src/lib/api/admin";

const api = vi.hoisted(() => ({
  items: [] as ReviewItem[],
  calls: [] as number[],
  refreshed: 0,
  error: null as unknown,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ refresh: () => (api.refreshed += 1) }),
}));

vi.mock("@/lib/api/admin", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/admin")>("../src/lib/api/admin");
  return {
    ...actual,
    adminApi: {
      reviews: async () => api.items,
      reviewOk: async (id: number) => {
        api.calls.push(id);
        if (api.error) throw api.error;
        api.items = api.items.filter((i) => i.document_id !== id);
        return {};
      },
    },
  };
});

const FILE: ReviewItem = {
  document_id: 7,
  source_id: 4,
  source_name: "이화목동 공지",
  title: "SOP 개정",
  review_reason: "big.pdf: not downloaded: larger than 20 MB",
  file_warning: true,
};
const FAILED: ReviewItem = { ...FILE, document_id: 8, title: "Broken post", review_reason: "layout changed", file_warning: false };

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.items = [FILE, FAILED];
  api.calls = [];
  api.refreshed = 0;
  api.error = null;
});
afterEach(cleanup);

describe("warnings list", () => {
  it("offers OK only for file warnings and removes the item once marked", async () => {
    show(<ReviewList />);
    expect(await screen.findByText("big.pdf: not downloaded: larger than 20 MB")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "OK, reviewed" })).toHaveLength(1);
    expect(screen.getByText(/failed to load and keeps its old state/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK, reviewed" }));
    expect(await screen.findByText("Marked OK: SOP 개정")).toBeTruthy();
    expect(api.calls).toEqual([7]);
    expect(screen.queryByText("SOP 개정")).toBeNull();
  });

  it("says when nothing needs review", async () => {
    api.items = [];
    show(<ReviewList />);
    expect(await screen.findByText("Nothing needs review.")).toBeTruthy();
  });
});

describe("OK button on the document page", () => {
  it("marks it OK and reloads the page", async () => {
    show(<ReviewOkButton documentId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "OK, reviewed" }));
    expect(await screen.findByText("Marked OK.")).toBeTruthy();
    expect(api.refreshed).toBe(1);
  });

  it("shows the server's reason when it refuses (a failed post)", async () => {
    api.error = new ApiError(409, "only file warnings can be marked OK; this document failed to load");
    show(<ReviewOkButton documentId={8} />);
    fireEvent.click(screen.getByRole("button", { name: "OK, reviewed" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/only file warnings/);
    expect(api.refreshed).toBe(0);
  });
});
