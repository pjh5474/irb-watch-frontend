import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AddSourceDialog } from "../src/components/admin/add-source-dialog";
import {
  filesProblem,
  ManualDocuments,
  planIsEmpty,
  planVersion,
  topLevel,
} from "../src/components/admin/manual-documents";
import type { AdminSource } from "../src/lib/api/admin";
import { sourceHealth } from "../src/lib/source-health";

const state = vi.hoisted(() => ({
  created: [] as unknown[],
  manualSources: [] as unknown[],
  versions: [] as unknown[],
  removed: [] as unknown[],
  docs: [] as unknown[],
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

// A chainable stand-in for the Supabase query builder: every call returns the builder, and
// awaiting it gives the rows for its table.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const rows =
        table === "documents"
          ? state.docs
          : table === "document_version_files"
            ? [
                { filename: "consent.pdf", size_label: "1KB", hash_only_reason: null },
                { filename: "forms.zip", size_label: "2KB", hash_only_reason: "unsupported_format" },
                { filename: "forms.zip/a.hwp", size_label: "1KB", hash_only_reason: null },
              ]
            : [];
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in"]) builder[m] = () => builder;
      builder.maybeSingle = async () => ({ data: { body_text: "old note" }, error: null });
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return builder;
    },
  }),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    createSource: async (body: unknown) => {
      state.created.push(body);
      return {};
    },
    createManualSource: async (body: unknown) => {
      state.manualSources.push(body);
      return {};
    },
    manualCreateDocument: async (id: number, body: { title: string; files: unknown[] }) => {
      state.versions.push(["new", id, body]);
      return { document_id: 5, change: "new", version_no: 1, warnings: [] };
    },
    manualAddVersion: async (id: number, doc: number, body: unknown) => {
      state.versions.push(["version", id, doc, body]);
      return { document_id: doc, change: "updated", version_no: 2, warnings: ["forms.zip/a.hwp: password-protected"] };
    },
    manualSetRemoved: async (id: number, doc: number, removed: boolean) => {
      state.removed.push([id, doc, removed]);
      return { document_id: doc, change: removed ? "removed" : "reappeared", version_no: 1, warnings: [] };
    },
  },
}));

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

const SOURCE = {
  id: 7,
  name: "Hanyang IRB",
  adapter: "manual",
  url: "manual:abc",
  is_active: true,
  requires_login: false,
  ai_enabled: true,
} as AdminSource;

beforeEach(() => {
  state.created = [];
  state.manualSources = [];
  state.versions = [];
  state.removed = [];
  state.docs = [
    { id: 5, title: "Consent form", posted_on: "2026-11-01", status: "current", review_reason: null, latest_version_id: 50 },
  ];
});
afterEach(cleanup);

describe("helpers", () => {
  it("a manual source is never stale", () => {
    const old = { is_active: true, last_scan_at: "2026-01-01T00:00:00Z", last_scan_status: "ok" };
    expect(sourceHealth({ ...old, adapter: "manual" }).level).toBe("ok");
    expect(sourceHealth(old).level).toBe("attention");
    expect(sourceHealth({ ...old, adapter: "manual", last_scan_status: "needs_review" }).level).toBe("problem");
  });

  it("lists only top-level files (zip members come with their zip)", () => {
    expect(topLevel([{ filename: "a.pdf" }, { filename: "z.zip" }, { filename: "z.zip/b.hwp" }])).toEqual(["a.pdf", "z.zip"]);
  });

  it("plans a version: kept, replaced, added, removed, title, note and date", () => {
    const plan = planVersion(
      { title: "T", note: "n", posted_on: "2026-11-01", files: ["a.pdf", "b.pdf", "c.pdf"] },
      {
        title: "T2",
        note: "n",
        posted_on: "",
        keep: new Set(["a.pdf", "b.pdf"]),
        files: [new File(["x"], "b.pdf"), new File(["y"], "d.pdf")],
      },
    );
    expect(plan).toEqual({
      title: "T2",
      note: false,
      date: null,
      kept: ["a.pdf"],
      removed: ["c.pdf"],
      replaced: ["b.pdf"],
      added: ["d.pdf"],
    });
    const same = planVersion(
      { title: "T", note: "n", posted_on: null, files: ["a.pdf"] },
      { title: "T", note: "n ", posted_on: "", keep: new Set(["a.pdf"]), files: [] },
    );
    expect(planIsEmpty(same)).toBe(true);
  });

  it("checks files before sending", () => {
    expect(filesProblem([new File([], "a.pdf")])?.key).toBe("manual.fileEmpty");
    expect(filesProblem([new File(["1"], "a.pdf"), new File(["2"], "a.pdf")])?.key).toBe("manual.sameName");
    expect(filesProblem(Array.from({ length: 21 }, (_, i) => new File(["x"], `${i}.pdf`)))?.key).toBe("manual.tooManyFiles");
    expect(filesProblem([new File(["x"], "a.pdf")])).toBeNull();
  });
});

describe("AddSourceDialog", () => {
  it("creates a manual source without a web address", async () => {
    show(<AddSourceDialog onClose={() => {}} onAdded={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Maintained by hand/ }));
    expect(screen.queryByLabelText(/Address/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hanyang IRB" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Members only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    await waitFor(() => expect(state.manualSources).toEqual([{ name: "Hanyang IRB", members_only: true }]));
    expect(state.created).toEqual([]);
  });
});

describe("ManualDocuments", () => {
  it("adds a document after a review step", async () => {
    show(<ManualDocuments source={SOURCE} />);
    fireEvent.click(await screen.findByRole("button", { name: "New document" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Protocol" } });
    fireEvent.change(screen.getByLabelText(/^Add files/), { target: { files: [new File(["x"], "protocol.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByText('New document "Protocol"')).toBeTruthy();
    expect(screen.getByText("Add protocol.pdf")).toBeTruthy();
    expect(state.versions).toEqual([]); // nothing is sent before Save
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.versions).toHaveLength(1));
    const [, , body] = state.versions[0] as [string, number, { title: string; files: { filename: string }[] }];
    expect(body.title).toBe("Protocol");
    expect(body.files.map((f) => f.filename)).toEqual(["protocol.pdf"]);
    expect(await screen.findByText("Saved as a new document (version 1).")).toBeTruthy();
  });

  it("a new version keeps, replaces and removes files, and says so before saving", async () => {
    show(<ManualDocuments source={SOURCE} />);
    fireEvent.click(await screen.findByRole("button", { name: "New version / remove" }));
    // zip members are not listed on their own
    await screen.findByRole("checkbox", { name: "forms.zip" });
    expect(screen.queryByRole("checkbox", { name: "forms.zip/a.hwp" })).toBeNull();
    const review = screen.getByRole("button", { name: "Review changes" }) as HTMLButtonElement;
    expect(review.disabled).toBe(true); // nothing changed yet
    fireEvent.click(screen.getByRole("checkbox", { name: "forms.zip" }));
    fireEvent.change(screen.getByLabelText(/^Add files/), { target: { files: [new File(["v2"], "consent.pdf")] } });
    fireEvent.click(review);
    expect(screen.getByText("Replace consent.pdf")).toBeTruthy();
    expect(screen.getByText("Remove forms.zip")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.versions).toHaveLength(1));
    const [, , doc, body] = state.versions[0] as [string, number, number, Record<string, unknown>];
    expect(doc).toBe(5);
    expect(body).toMatchObject({ title: null, note: null, posted_on: null, keep_files: [] });
    expect(await screen.findByText(/Check these files: forms.zip\/a.hwp: password-protected/)).toBeTruthy();
  });

  it("marks a document removed after a confirm, and restores a removed one", async () => {
    show(<ManualDocuments source={SOURCE} />);
    fireEvent.click(await screen.findByRole("button", { name: "New version / remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark removed" }));
    expect(screen.getByText(/Mark this document removed\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark removed" }));
    await waitFor(() => expect(state.removed).toEqual([[7, 5, true]]));

    cleanup();
    state.docs = [{ ...(state.docs[0] as object), status: "removed" }];
    show(<ManualDocuments source={SOURCE} />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" }).at(-1)!);
    await waitFor(() => expect(state.removed).toEqual([[7, 5, true], [7, 5, false]]));
  });

  it("an inactive source cannot take uploads", async () => {
    show(<ManualDocuments source={{ ...SOURCE, is_active: false }} />);
    expect(((await screen.findByRole("button", { name: "New document" })) as HTMLButtonElement).disabled).toBe(true);
  });
});
