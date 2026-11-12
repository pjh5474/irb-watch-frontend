import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { GuideLibrary, HospitalGuides } from "../src/components/admin/guide-library";
import { ApiError } from "../src/lib/api/client";
import type { Guide } from "../src/lib/api/docgen";

const state = vi.hoisted(() => ({
  guides: [] as Guide[],
  linked: [] as Guide[],
  created: [] as unknown[],
  archived: [] as number[],
  links: [] as unknown[],
  createError: null as unknown,
  updates: [] as unknown[],
  siteSets: [] as unknown[],
  replaced: [] as unknown[],
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => "/admin/guides",
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    hospitals: async () => ({
      hospitals: [
        { id: 1, name: "SNUH", note: "", created_at: "", updated_at: "", boards: [{ id: 11, name: "Public board" }] },
        { id: 2, name: "Daegu Catholic", note: "", created_at: "", updated_at: "", boards: [{ id: 12, name: "Daegu notices" }] },
        { id: 3, name: "Ewha", note: "", created_at: "", updated_at: "", boards: [{ id: 13, name: "Ewha forms" }] },
      ],
      board_kinds: ["notice", "forms", "regulations", "other"],
    }),
  },
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
        return { id: 9, title, filename: file.filename, chars: 5, hospital_ids: [], created_at: "", archived_at: null, body_text: "Hello guide" };
      },
      archiveGuide: async (id: number) => {
        state.archived.push(id);
      },
      hospitalGuides: async () => state.linked,
      linkGuide: async (s: number, g: number) => {
        state.links.push(["link", s, g]);
      },
      unlinkGuide: async (s: number, g: number) => {
        state.links.push(["unlink", s, g]);
      },
      updateGuide: async (id: number, body: unknown) => {
        state.updates.push([id, body]);
        return {};
      },
      setGuideHospitals: async (id: number, ids: number[]) => {
        state.siteSets.push([id, ids]);
        return {};
      },
      replaceGuideFile: async (id: number, file: { filename: string }) => {
        state.replaced.push([id, file.filename]);
        return {};
      },
      guide: async () => ({ body_text: "Current guide text" }),
      guideHistory: async () => [
        {
          id: 1,
          filename: "old.txt",
          body_text: "Old text",
          chars: 8,
          valid_from: "2026-11-01T00:00:00Z",
          replaced_by: null,
          replaced_at: "2026-11-05T00:00:00Z",
        },
      ],
    },
  };
});

const guide = (id: number, title: string, extra: Partial<Guide> = {}): Guide => ({
  id,
  title,
  filename: `${title}.txt`,
  chars: 100,
  hospital_ids: [],
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
  state.guides = [guide(1, "SNUH guide", { hospital_ids: [1] }), guide(2, "Old guide", { archived_at: "2026-11-01" })];
  state.linked = [];
  state.created = [];
  state.archived = [];
  state.links = [];
  state.updates = [];
  state.siteSets = [];
  state.replaced = [];
  state.createError = null;
});
afterEach(cleanup);

describe("GuideLibrary", () => {
  it("lists active guides with the hospitals that use them", async () => {
    show(<GuideLibrary />);
    expect(await screen.findByText("SNUH guide")).toBeTruthy();
    expect(await screen.findByText("Used by: SNUH")).toBeTruthy();
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
    // the first "Archive" opens the question; the confirm button is the second one
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[1]);
    await waitFor(() => expect(state.archived).toEqual([1]));
  });

  it("makes a guide global and back", async () => {
    show(<GuideLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: "Make global" }));
    await waitFor(() => expect(state.updates).toEqual([[1, { is_global: true }]]));
    expect(await screen.findByText("The guide now applies to every site.")).toBeTruthy();
  });

  it("a global guide shows 'every hospital' and cannot have its hospitals edited", async () => {
    state.guides = [guide(1, "Common guide", { is_global: true, hospital_ids: [1] })];
    show(<GuideLibrary />);
    expect(await screen.findByText("Applies to every hospital (global)")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit hospitals" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Make hospital-specific" })).toBeTruthy();
  });

  it("links one guide to many hospitals at once", async () => {
    show(<GuideLibrary />);
    expect(await screen.findByText("Used by: SNUH")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit hospitals" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Daegu Catholic/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ewha/ }));
    expect(screen.getByText("3 hospitals selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save hospitals" }));
    await waitFor(() => expect(state.siteSets).toEqual([[1, [1, 2, 3]]]));
  });

  it("the search finds hospitals by board name and 'select all shown' picks only those", async () => {
    show(<GuideLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit hospitals" }));
    fireEvent.change(screen.getByLabelText("Search hospitals or their boards by name"), { target: { value: "notices" } });
    expect(screen.queryByText("SNUH")).toBeNull();
    expect(screen.getByText("Daegu Catholic")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Save hospitals" }));
    await waitFor(() => expect(state.siteSets).toEqual([[1, [1, 2]]]));
  });

  it("filters guides by name and by scope", async () => {
    state.guides = [
      guide(1, "SNUH guide", { hospital_ids: [1] }),
      guide(4, "Common guide", { is_global: true }),
      guide(5, "Loose guide"),
    ];
    show(<GuideLibrary />);
    await screen.findByText("Loose guide");
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "global" } });
    expect(screen.queryByText("SNUH guide")).toBeNull();
    expect(screen.getByText("Common guide")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "unlinked" } });
    expect(screen.getByText("Loose guide")).toBeTruthy();
    expect(screen.queryByText("Common guide")).toBeNull();
    await screen.findByRole("option", { name: "Used by SNUH" });
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "hospital:1" } });
    expect(screen.getByText("SNUH guide")).toBeTruthy();
    expect(screen.getByText("Common guide")).toBeTruthy(); // a global guide applies to every site
    fireEvent.change(screen.getByLabelText("Search guides by name or file"), { target: { value: "snuh" } });
    expect(screen.queryByText("Common guide")).toBeNull();
  });

  it("renames, replaces the file and shows the text and its history", async () => {
    show(<GuideLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const name = screen.getAllByLabelText("Name").at(-1) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "SNUH amendment guide" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.updates).toEqual([[1, { title: "SNUH amendment guide" }]]));

    fireEvent.click(await screen.findByRole("button", { name: "Replace file" }));
    const box = screen.getAllByLabelText(/^File/).at(-1) as HTMLInputElement;
    fireEvent.change(box, { target: { files: [new File(["new"], "new.md")] } });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(state.replaced).toEqual([[1, "new.md"]]));

    fireEvent.click(await screen.findByRole("button", { name: "View text" }));
    expect(await screen.findByText("Current guide text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText(/old\.txt: in use/)).toBeTruthy();
  });

  it("uploads a guide as global when the box is ticked", async () => {
    show(<GuideLibrary />);
    fireEvent.change(await screen.findByPlaceholderText(/SNUH amendment request guide/), { target: { value: "Common" } });
    fireEvent.change(screen.getAllByLabelText(/^File/)[0], { target: { files: [new File(["x"], "g.txt")] } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Use for every site/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(state.updates).toEqual([[9, { is_global: true }]]));
  });
});

describe("HospitalGuides", () => {
  it("shows global guides as Global without unlink, and does not offer them for linking", async () => {
    state.linked = [guide(4, "Common guide", { is_global: true })];
    state.guides = [guide(4, "Common guide", { is_global: true }), guide(3, "Extra guide")];
    show(<HospitalGuides hospitalId={1} hospitalName="SNUH" />);
    expect(await screen.findByText("Guides of SNUH")).toBeTruthy();
    expect(await screen.findByText("Global")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unlink" })).toBeNull();
    await screen.findByRole("option", { name: "Extra guide" });
    expect(screen.queryByRole("option", { name: "Common guide" })).toBeNull();
  });

  it("links and unlinks guides for one hospital", async () => {
    state.linked = [guide(1, "SNUH guide")];
    state.guides = [guide(1, "SNUH guide"), guide(3, "Extra guide")];
    show(<HospitalGuides hospitalId={1} hospitalName="SNUH" />);
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
