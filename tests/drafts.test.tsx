import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { choiceOf, newChosen, sendsNothing, sourcesNeedingAgreement } from "../src/components/drafts/document-picker";
import { DraftEditor } from "../src/components/drafts/draft-editor";
import { panelGuides, startPanel } from "../src/components/drafts/inputs-panel";
import { buildRequest, NewDraft } from "../src/components/drafts/new-draft";
import { ApiError, apiFetch, filenameFrom } from "../src/lib/api/client";
import { mergeMatches } from "../src/lib/draft-picker";
import { elapsed, guideFileProblem, type DraftDetail } from "../src/lib/api/docgen";

// ---- fakes --------------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  created: [] as unknown[],
  saved: [] as string[],
  bases: [] as number[],
  guidesPending: false,
  revised: [] as unknown[],
  createError: null as unknown,
  saveError: null as unknown,
  detail: null as unknown,
  pushed: [] as string[],
  signOuts: 0,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      signOut: async () => {
        state.signOuts += 1;
      },
    },
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: (href: string) => state.pushed.push(href) }),
}));

vi.mock("@/lib/draft-picker", async () => ({
  // the pure helpers stay real; only the Supabase reads are faked
  ...(await vi.importActual<typeof import("../src/lib/draft-picker")>("../src/lib/draft-picker")),
  pickerSources: async () => [
    { id: 1, name: "Public board", requires_login: false, ai_enabled: true },
    { id: 3, name: "Study X", requires_login: true, ai_enabled: false },
  ],
  PICKER_LIMIT: 20,
  pickerDocuments: async (sourceId: number, search: string) =>
    search === "protocol.pdf"
      ? {
          documents: [{ id: 11, title: "Notice", posted_on: "2026-11-02", source_id: 1, matched_files: ["protocol.pdf"] }],
          more: false,
        }
      : sourceId === 1
        ? { documents: [{ id: 10, title: "Consent form", posted_on: "2026-11-01", source_id: 1 }], more: !search.includes("Consent") }
        : { documents: [{ id: 30, title: "Study protocol", posted_on: null, source_id: 3 }], more: false },
  pickerVersions: async () => [
    { version_no: 3, created_at: "2026-11-03" },
    { version_no: 2, created_at: "2026-11-02" },
    { version_no: 1, created_at: "2026-11-01" },
  ],
  pickerFiles: async (_id: number, versionNo: number | null) =>
    versionNo === 1
      ? [{ filename: "old.pdf", no_text: false }]
      : [
          { filename: "consent.hwp", no_text: false },
          { filename: "protocol.pdf", no_text: true },
        ],
  pickerTitles: async (ids: number[]) => new Map(ids.map((i) => [i, `Title ${i}`])),
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    docgenApi: {
      status: async () => ({ enabled: true, used: 1, limit: 10, reason: null }),
      templates: async () => [],
      defaultGuides: (ids: number[]) =>
        state.guidesPending
          ? new Promise(() => {})
          : Promise.resolve(
              ids.includes(1)
                ? [{ id: 5, title: "SNUH guide", filename: "g.txt", chars: 120, hospital_ids: [1], created_at: "", archived_at: null }]
                : [],
            ),
      create: async (body: unknown) => {
        state.created.push(body);
        if (state.createError) throw state.createError;
        return { draft: { id: "d-1" }, versions: [], guides: [] };
      },
      get: async () => state.detail,
      saveEdit: async (_id: string, markdown: string, base: number) => {
        state.saved.push(markdown);
        state.bases.push(base);
        if (state.saveError) throw state.saveError;
        return { version_no: 3, markdown, origin: "user_edit", instruction: "", created_at: "" };
      },
      revise: async (...args: unknown[]) => {
        state.revised.push(args);
        const v = { version_no: 3, markdown: "# Revised by AI", origin: "ai_revision", instruction: "", created_at: "2026-11-10T02:00:00Z" };
        (state.detail as DraftDetail).versions.push(v as DraftDetail["versions"][number]);
        return v;
      },
      exportDocx: async () => ({ blob: new Blob(["x"]), filename: "a.docx" }),
    },
  };
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

const DETAIL: DraftDetail = {
  draft: {
    id: "d-1",
    title: "Amendment request",
    instruction: "",
    documents: [{ document_id: 10, version_no: 2, source_id: 1 }],
    guide_ids: [5],
    extra_guides: [],
    ai_override_source_ids: [],
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
  },
  versions: [
    { version_no: 1, markdown: "# Old draft", origin: "ai", instruction: "", created_at: "2026-11-10T00:00:00Z" },
    { version_no: 2, markdown: "# New draft", origin: "user_edit", instruction: "", created_at: "2026-11-10T01:00:00Z" },
  ],
  guides: [{ id: 5, title: "SNUH guide", filename: "g.txt", chars: 120, hospital_ids: [1], created_at: "", archived_at: null }],
};

beforeEach(() => {
  state.created = [];
  state.saved = [];
  state.bases = [];
  state.guidesPending = false;
  state.revised = [];
  state.createError = null;
  state.saveError = null;
  state.detail = structuredClone(DETAIL);
  state.pushed = [];
  state.signOuts = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- pure helpers -------------------------------------------------------------------------

describe("helpers", () => {
  it("sends null guide_ids unless the user unticked one", () => {
    const chosen = [newChosen({ id: 10, title: "a", source_id: 1, version_no: null })];
    expect(buildRequest(chosen, [5, 6], new Set(), new Set(), []).guide_ids).toBeNull();
    expect(buildRequest(chosen, [5, 6], new Set([6]), new Set(), []).guide_ids).toEqual([5]);
    expect(buildRequest(chosen, [5], new Set([5]), new Set(), []).guide_ids).toEqual([]);
  });

  it("only ticked AI-off sources are sent as allowed", () => {
    const r = buildRequest([], [], new Set(), new Set([3, 9]), [3, 4]);
    expect(r.ai_override_source_ids).toEqual([3]);
  });

  it("guide files are checked by type, size and emptiness", () => {
    expect(guideFileProblem(new File(["x"], "g.exe"))).toBe("type");
    expect(guideFileProblem(new File([], "g.txt"))).toBe("empty");
    expect(guideFileProblem(new File(["x"], "G.HWPX"))).toBeNull();
  });

  it("formats elapsed time as m:ss", () => {
    expect(elapsed(0)).toBe("0:00");
    expect(elapsed(65_400)).toBe("1:05");
  });

  it("reads the file name from Content-Disposition, Korean included", () => {
    const header = `attachment; filename="v2.docx"; filename*=UTF-8''%EB%B3%80%EA%B2%BD%20v2.docx`;
    expect(filenameFrom(header, "x")).toBe("변경 v2.docx");
    expect(filenameFrom('attachment; filename="plain.docx"', "x")).toBe("plain.docx");
    expect(filenameFrom(null, "fallback.docx")).toBe("fallback.docx");
  });

  it("asks again for AI-off sources not allowed when the draft was made", () => {
    const flags = new Map([[1, true], [3, false]]);
    expect(sourcesNeedingAgreement([1, 3, 3], [], flags)).toEqual([3]);
    expect(sourcesNeedingAgreement([1, 3], [3], flags)).toEqual([]);
  });

  it("sends the chosen files, page text and comparison of each document", () => {
    const c = { ...newChosen({ id: 10, title: "a", source_id: 1, version_no: 3 }), files: ["b.pdf"], compare_with: 1 };
    expect(choiceOf(c)).toEqual({ document_id: 10, version_no: 3, files: ["b.pdf"], page_text: true, compare_with: 1, compare: true });
    // "no comparison" drops the version number
    expect(choiceOf({ ...c, compare: false }).compare_with).toBeNull();
  });

  it("search results: newest post first, title matches win over file matches", () => {
    const doc = (id: number, posted_on: string | null) => ({ id, title: `T${id}`, posted_on, source_id: 1 });
    const merged = mergeMatches(
      [doc(1, "2026-01-01"), doc(2, null)],
      [doc(1, "2026-01-01"), doc(3, "2026-05-01"), doc(4, "2026-01-01")],
      new Map([[1, ["a.pdf"]], [3, ["b.pdf"]], [4, ["c.pdf"]]]),
    );
    expect(merged.map((d) => d.id)).toEqual([3, 4, 1, 2]);
    expect(merged.find((d) => d.id === 1)?.matched_files).toBeUndefined(); // the title matched
    expect(merged.find((d) => d.id === 3)?.matched_files).toEqual(["b.pdf"]);
  });

  it("a document that would send nothing is caught", () => {
    const c = newChosen({ id: 10, title: "a", source_id: 1, version_no: null });
    expect(sendsNothing(c, 2)).toBe(false);
    expect(sendsNothing({ ...c, page_text: false }, 2)).toBe(false);
    expect(sendsNothing({ ...c, page_text: false }, 0)).toBe(true);
    expect(sendsNothing({ ...c, page_text: false, files: [] }, undefined)).toBe(true);
  });

  it("the side panel ticks the draft's guides and a new source's guides, not ones the user left out", () => {
    const d = structuredClone(DETAIL);
    d.guides = [];
    d.draft.guide_ids = [];
    const g = (id: number) => ({ id, title: `G${id}`, filename: "", chars: 1, hospital_ids: [], created_at: "", archived_at: null });
    const state = startPanel(d, new Map([[10, "Consent form"]]));
    expect(state.chosen[0]).toMatchObject({ id: 10, title: "Consent form", files: null, page_text: true });
    // guide 5 was a default the user left out; guide 7 comes with a newly added source
    const list = panelGuides(state, d, [g(5), g(7)], new Set([5]));
    expect(list.map((x) => [x.guide.id, x.ticked])).toEqual([[5, false], [7, true]]);
    state.toggled.set(5, true);
    expect(panelGuides(state, d, [g(5), g(7)], new Set([5]))[0].ticked).toBe(true);
  });
});

// ---- 401 vs 403 ---------------------------------------------------------------------------

describe("apiFetch sign-out rule", () => {
  it("a 403 is a reason to show, not a sign-out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "admin access required" }), { status: 403 })));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 403, message: "admin access required" });
    expect(state.signOuts).toBe(0);
  });

  it("a 401 still signs the user out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/en/drafts", assign });
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 401 });
    expect(state.signOuts).toBe(1);
    expect(assign).toHaveBeenCalledWith("/en/login?reason=session");
  });
});

// ---- new draft ----------------------------------------------------------------------------

describe("NewDraft", () => {
  it("adds a document, uses the source's guides and writes the draft", async () => {
    show(<NewDraft initial={null} />);
    const select = await screen.findByLabelText("Source");
    await screen.findByRole("option", { name: "Public board" });
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(await screen.findByText("SNUH guide")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write the draft" }));
    await waitFor(() => expect(state.pushed).toEqual(["/drafts/d-1"]));
    expect(state.created[0]).toMatchObject({
      documents: [{ document_id: 10, version_no: null }],
      guide_ids: null,
      ai_override_source_ids: [],
    });
  });

  it("an AI-off study needs the box before the draft can be written", async () => {
    show(<NewDraft initial={{ id: 30, title: "Study protocol", source_id: 3, version_no: 1 }} />);
    expect(await screen.findByText("AI is switched off for Study X")).toBeTruthy();
    const write = screen.getByRole("button", { name: "Write the draft" }) as HTMLButtonElement;
    expect(write.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Study X may be sent to OpenAI/ }));
    await waitFor(() => expect(write.disabled).toBe(false));
    fireEvent.click(write);
    await waitFor(() => expect(state.created).toHaveLength(1));
    expect(state.created[0]).toMatchObject({
      documents: [{ document_id: 30, version_no: 1 }],
      ai_override_source_ids: [3],
    });
  });

  it("waits for the guide list before the draft can be written", async () => {
    state.guidesPending = true;
    show(<NewDraft initial={{ id: 10, title: "Consent form", source_id: 1, version_no: null }} />);
    await screen.findByText("Consent form");
    expect((screen.getByRole("button", { name: "Write the draft" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a pinned version stays visible even when it is not in the loaded list", async () => {
    show(<NewDraft initial={{ id: 10, title: "Consent form", source_id: 1, version_no: 7 }} />);
    const select = (await screen.findByLabelText("Versions")) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Version 2" });
    expect(select.value).toBe("7");
    expect(screen.getByRole("option", { name: "Version 7 (chosen)" })).toBeTruthy();
  });

  it("says when a source has more documents than shown and points to the search box", async () => {
    show(<NewDraft initial={null} />);
    const select = await screen.findByLabelText("Source");
    await screen.findByRole("option", { name: "Public board" });
    fireEvent.change(select, { target: { value: "1" } });
    expect(await screen.findByText(/Only the newest 20 documents are shown/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search titles and file names"), { target: { value: "Consent" } });
    await waitFor(() => expect(screen.queryByText(/Only the newest 20/)).toBeNull());
    fireEvent.change(select, { target: { value: "3" } });
    await screen.findByText("Study protocol");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a post found by a file name shows the file and is added with only that file ticked", async () => {
    show(<NewDraft initial={null} />);
    const select = await screen.findByLabelText("Source");
    await screen.findByRole("option", { name: "Public board" });
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Search titles and file names"), { target: { value: "protocol.pdf" } });
    expect(await screen.findByText("File: protocol.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const protocol = (await screen.findByRole("checkbox", { name: /protocol\.pdf/ })) as HTMLInputElement;
    const consent = screen.getByRole("checkbox", { name: /consent\.hwp/ }) as HTMLInputElement;
    expect(protocol.checked).toBe(true);
    expect(consent.checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Page text (the post itself)" }) as HTMLInputElement).checked).toBe(true);
  });

  it("sends only the ticked files and the chosen comparison", async () => {
    show(<NewDraft initial={{ id: 10, title: "Consent form", source_id: 1, version_no: null }} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /protocol\.pdf/ }));
    expect(screen.getByText("no text; only its name is sent")).toBeTruthy();
    const compare = screen.getByLabelText("Changes listed against") as HTMLSelectElement;
    await screen.findByRole("option", { name: "Changes since version 1" });
    // version 2 is "the version before" of the newest (3), so it is not listed twice
    expect(screen.queryByRole("option", { name: "Changes since version 2" })).toBeNull();
    fireEvent.change(compare, { target: { value: "1" } });
    await screen.findByText("SNUH guide");
    fireEvent.click(screen.getByRole("button", { name: "Write the draft" }));
    await waitFor(() => expect(state.created).toHaveLength(1));
    expect(state.created[0]).toMatchObject({
      documents: [{ document_id: 10, version_no: null, files: ["consent.hwp"], page_text: true, compare_with: 1, compare: true }],
    });
  });

  it("unticking everything blocks the send and says why; another version ticks all files again", async () => {
    show(<NewDraft initial={{ id: 10, title: "Consent form", source_id: 1, version_no: null }} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /consent\.hwp/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /protocol\.pdf/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Page text (the post itself)" }));
    expect(await screen.findByText("Tick the page text or at least one file.")).toBeTruthy();
    await screen.findByText("SNUH guide");
    expect((screen.getByRole("button", { name: "Write the draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Versions"), { target: { value: "1" } });
    const old = (await screen.findByRole("checkbox", { name: /old\.pdf/ })) as HTMLInputElement;
    expect(old.checked).toBe(true);
  });

  it("shows the server's reason when writing fails", async () => {
    state.createError = new ApiError(429, "you have used your 10 AI drafts");
    show(<NewDraft initial={{ id: 30, title: "Study protocol", source_id: 3, version_no: null }} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Study X/ }));
    fireEvent.click(screen.getByRole("button", { name: "Write the draft" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/10 AI drafts/);
    expect(state.pushed).toEqual([]);
  });
});

// ---- the editor ---------------------------------------------------------------------------

describe("DraftEditor", () => {
  it("edits the newest version and saves it as a new one", async () => {
    show(<DraftEditor id="d-1" />);
    const editor = (await screen.findByLabelText("Edit")) as HTMLTextAreaElement;
    expect(editor.value).toBe("# New draft");
    const save = screen.getByRole("button", { name: "Save as new version" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(editor, { target: { value: "# Mine" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    // the AI revises the saved version only
    expect((screen.getByRole("button", { name: "Revise" }) as HTMLButtonElement).disabled).toBe(true);
    // the DOCX is made from the saved version, so it waits for the save
    expect((screen.getByRole("button", { name: "Download DOCX" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save your changes first/)).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(state.saved).toEqual(["# Mine"]));
    expect(state.bases).toEqual([2]); // the version the edit started from
    expect(await screen.findByText("Saved as version 3.")).toBeTruthy();
  });

  it("a revision is shown even after an edit that was typed and undone", async () => {
    show(<DraftEditor id="d-1" />);
    const editor = (await screen.findByLabelText("Edit")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# New draftX" } });
    fireEvent.change(editor, { target: { value: "# New draft" } }); // back to the saved text
    fireEvent.change(screen.getByPlaceholderText(/make section 2 shorter/), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    await waitFor(() => expect((screen.getByLabelText("Edit") as HTMLTextAreaElement).value).toBe("# Revised by AI"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("older versions are read-only", async () => {
    show(<DraftEditor id="d-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Version 1/ }));
    const editor = screen.getByLabelText("Edit") as HTMLTextAreaElement;
    expect(editor.value).toBe("# Old draft");
    expect(editor.readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Save as new version" })).toBeNull();
  });

  it("a clash on save explains itself and offers a reload", async () => {
    state.saveError = new ApiError(409, "reload it and save again");
    show(<DraftEditor id="d-1" />);
    fireEvent.change(await screen.findByLabelText("Edit"), { target: { value: "# Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as new version" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/changed at the same moment/);
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("compares two versions word by word", async () => {
    show(<DraftEditor id="d-1" />);
    fireEvent.change(await screen.findByLabelText("Compare with"), { target: { value: "1" } });
    expect(screen.getByText("Version 1 → Version 2")).toBeTruthy();
    expect(document.querySelector("del")?.textContent).toMatch(/Old/);
    expect(document.querySelector("ins")?.textContent).toMatch(/New/);
  });

  it("sends a revision request", async () => {
    show(<DraftEditor id="d-1" />);
    fireEvent.change(await screen.findByPlaceholderText(/make section 2 shorter/), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    await waitFor(() => expect(state.revised).toEqual([["d-1", "shorter", []]]));
    expect(await screen.findByText("The AI's revision is version 3.")).toBeTruthy();
  });

  it("the side panel shows the draft's documents and sends changed ones with the revision", async () => {
    show(<DraftEditor id="d-1" />);
    expect(await screen.findByText("Title 10")).toBeTruthy();
    expect(screen.getByText("All files")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change documents and guides" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /protocol\.pdf/ }));
    expect(screen.getByText(/reads the documents and guides chosen in the side panel/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/make section 2 shorter/), { target: { value: "use the consent only" } });
    const revise = screen.getByRole("button", { name: "Revise" }) as HTMLButtonElement;
    await waitFor(() => expect(revise.disabled).toBe(false));
    fireEvent.click(revise);
    await waitFor(() => expect(state.revised).toHaveLength(1));
    const [, , , inputs] = state.revised[0] as [string, string, number[], Record<string, unknown>];
    expect(inputs).toMatchObject({
      documents: [{ document_id: 10, version_no: 2, files: ["consent.hwp"], page_text: true, compare: true }],
      guide_ids: [5],
      keep_extra_guides: [],
      extra_guides: [],
    });
    // after the revision the panel shows the saved selection again
    expect(await screen.findByRole("button", { name: "Change documents and guides" })).toBeTruthy();
  });

  it("shows what an AI version was written from", async () => {
    (state.detail as DraftDetail).versions[1].inputs = {
      documents: [{ document_id: 10, version_no: 2, source_id: 1, files: ["consent.hwp"], page_text: false, compare: false }],
      guide_ids: [5],
      extra_guides: ["mine.txt"],
      ai_override_source_ids: [],
    };
    show(<DraftEditor id="d-1" />);
    fireEvent.click(await screen.findByText("What version 2 was written from"));
    expect(screen.getByText("Files: consent.hwp · without page text · No list of changes")).toBeTruthy();
  });

  it("a missing draft says so", async () => {
    state.detail = null;
    const { docgenApi } = await import("../src/lib/api/docgen");
    const original = docgenApi.get;
    docgenApi.get = async () => {
      throw new ApiError(404, "draft not found");
    };
    show(<DraftEditor id="d-1" />);
    expect((await screen.findByRole("alert")).textContent).toBe("This draft does not exist or was deleted.");
    docgenApi.get = original;
  });
});

// ---- messages -----------------------------------------------------------------------------

function has(messages: Record<string, unknown>, path: string): boolean {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("drafts messages", () => {
  const keys = new Set<string>(["errors.unreachable", "errors.generic", "origin.ai", "origin.user_edit", "origin.ai_revision"]);
  for (const f of readdirSync("src/components/drafts")) {
    const text = readFileSync(join("src/components/drafts", f), "utf8");
    for (const m of text.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) keys.add(m[1]);
  }
  it.each([...keys].sort())("%s exists in en and ko", (key) => {
    expect(has(en.drafts, key), `en.drafts.${key}`).toBe(true);
    expect(has(ko.drafts, key), `ko.drafts.${key}`).toBe(true);
  });
  it("nav and document page keys exist", () => {
    for (const m of [en, ko]) {
      expect(has(m.nav, "drafts")).toBe(true);
      expect(has(m.doc, "draftFromThis")).toBe(true);
    }
  });
});
