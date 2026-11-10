import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { DraftEditor, sourcesNeedingAgreement } from "../src/components/drafts/draft-editor";
import { buildRequest, NewDraft } from "../src/components/drafts/new-draft";
import { ApiError, apiFetch, filenameFrom } from "../src/lib/api/client";
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

vi.mock("@/lib/draft-picker", () => ({
  pickerSources: async () => [
    { id: 1, name: "Public board", requires_login: false, ai_enabled: true },
    { id: 3, name: "Study X", requires_login: true, ai_enabled: false },
  ],
  pickerDocuments: async (sourceId: number) =>
    sourceId === 1
      ? [{ id: 10, title: "Consent form", posted_on: "2026-11-01", source_id: 1 }]
      : [{ id: 30, title: "Study protocol", posted_on: null, source_id: 3 }],
  pickerVersions: async () => [{ version_no: 2, created_at: "2026-11-02" }, { version_no: 1, created_at: "2026-11-01" }],
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    docgenApi: {
      status: async () => ({ enabled: true, used: 1, limit: 10, reason: null }),
      defaultGuides: (ids: number[]) =>
        state.guidesPending
          ? new Promise(() => {})
          : Promise.resolve(
              ids.includes(1)
                ? [{ id: 5, title: "SNUH guide", filename: "g.txt", chars: 120, source_ids: [1], created_at: "", archived_at: null }]
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
  guides: [{ id: 5, title: "SNUH guide", filename: "g.txt", chars: 120, source_ids: [1], created_at: "", archived_at: null }],
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
    const chosen = [{ id: 10, title: "a", source_id: 1, version_no: null }];
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
    const d = structuredClone(DETAIL);
    d.draft.documents.push({ document_id: 30, version_no: 1, source_id: 3 });
    const flags = new Map([[1, true], [3, false]]);
    expect(sourcesNeedingAgreement(d, flags)).toEqual([3]);
    d.draft.ai_override_source_ids = [3];
    expect(sourcesNeedingAgreement(d, flags)).toEqual([]);
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
