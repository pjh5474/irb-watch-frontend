import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { GuideLibrary, SourceGuides } from "../src/components/admin/guide-library";
import { ApiError } from "../src/lib/api/client";
import type { Guide } from "../src/lib/api/docgen";

const state = vi.hoisted(() => ({
  guides: [] as Guide[],
  linked: [] as Guide[],
  created: [] as unknown[],
  archived: [] as number[],
  links: [] as unknown[],
  createError: null as unknown,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => "/admin/guides",
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { sources: async () => [{ id: 1, name: "Public board" }] },
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    docgenApi: {
      guides: async (archived: boolean) => state.guides.filter((g) => archived || !g.archived_at),
      createGuide: async (title: string, file: { filename: string }) => {
        state.created.push({ title, filename: file.filename });
        if (state.createError) throw state.createError;
        return { id: 9, title, filename: file.filename, chars: 5, source_ids: [], created_at: "", archived_at: null, body_text: "Hello guide" };
      },
      archiveGuide: async (id: number) => {
        state.archived.push(id);
      },
      sourceGuides: async () => state.linked,
      linkGuide: async (s: number, g: number) => {
        state.links.push(["link", s, g]);
      },
      unlinkGuide: async (s: number, g: number) => {
        state.links.push(["unlink", s, g]);
      },
    },
  };
});

const guide = (id: number, title: string, extra: Partial<Guide> = {}): Guide => ({
  id,
  title,
  filename: `${title}.txt`,
  chars: 100,
  source_ids: [],
  created_at: "",
  archived_at: null,
  ...extra,
});

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
  state.guides = [guide(1, "SNUH guide", { source_ids: [1] }), guide(2, "Old guide", { archived_at: "2026-11-01" })];
  state.linked = [];
  state.created = [];
  state.archived = [];
  state.links = [];
  state.createError = null;
});
afterEach(cleanup);

describe("GuideLibrary", () => {
  it("lists active guides with the sources that use them", async () => {
    show(<GuideLibrary />);
    expect(await screen.findByText("SNUH guide")).toBeTruthy();
    expect(await screen.findByText("Used by: Public board")).toBeTruthy();
    expect(screen.queryByText("Old guide")).toBeNull();
    fireEvent.click(screen.getByLabelText("Show archived guides"));
    expect(await screen.findByText("Old guide")).toBeTruthy();
  });

  it("uploads a guide and shows the text that was read", async () => {
    show(<GuideLibrary />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My guide" } });
    const input = screen.getByLabelText(/File \(PDF/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["# Hello"], "g.md")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Hello guide")).toBeTruthy();
    expect(state.created).toEqual([{ title: "My guide", filename: "g.md" }]);
    // the file box is emptied, so the next upload asks for a file it really has
    expect((screen.getByLabelText(/File \(PDF/) as HTMLInputElement).files?.length ?? 0).toBe(0);
  });

  it("refuses a missing name, a wrong file type, and shows the server's reason", async () => {
    show(<GuideLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give the guide a name.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/File \(PDF/), { target: { files: [new File(["x"], "g.exe")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This file type cannot be used as a guide.");
    state.createError = new ApiError(422, "g.pdf: no text could be read from this file");
    fireEvent.change(screen.getByLabelText(/File \(PDF/), { target: { files: [new File(["x"], "g.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no text could be read/);
  });

  it("archives only after a confirm", async () => {
    show(<GuideLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    expect(state.archived).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    await waitFor(() => expect(state.archived).toEqual([1]));
  });
});

describe("SourceGuides", () => {
  it("links and unlinks guides for one source", async () => {
    state.linked = [guide(1, "SNUH guide")];
    state.guides = [guide(1, "SNUH guide"), guide(3, "Extra guide")];
    show(<SourceGuides sourceId={1} />);
    expect(await screen.findByText("SNUH guide")).toBeTruthy();
    const select = screen.getByLabelText("Link a guide");
    await screen.findByRole("option", { name: "Extra guide" });
    expect(screen.queryByRole("option", { name: "SNUH guide" })).toBeNull();
    fireEvent.change(select, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(state.links).toEqual([["link", 1, 3]]));
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(state.links).toContainEqual(["unlink", 1, 1]));
  });
});
