import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { editsOf, reviewRows } from "../src/components/admin/template-card";
import { TemplateLibrary } from "../src/components/admin/template-library";
import { DraftEditor } from "../src/components/drafts/draft-editor";
import { FormChoice, formReady, formRequest, NO_FORM, type FormPick } from "../src/components/drafts/form-choice";
import { FieldEditor, toggleOption } from "../src/components/drafts/form-fields";
import {
  pickedOf,
  sameAnswers,
  templateFileProblem,
  type DraftDetail,
  type FormField,
  type FormTemplate,
} from "../src/lib/api/docgen";

// ---- fakes --------------------------------------------------------------------------------

const TEXT: FormField = { key: "m:title", label: "Study title", kind: "text", source: "marker", where: "marker:title", options: [], multi: false, hint: "Korean" };
const CHOICE: FormField = { key: "c:body/1", label: "Type", kind: "choice", source: "auto", where: "body/1", options: ["New", "Change"], multi: false, hint: "" };
const MULTI: FormField = { ...CHOICE, key: "c:body/2", label: "Attached", options: ["Protocol", "Consent", "CRF"], multi: true };

const TEMPLATE: FormTemplate = {
  id: 7,
  title: "SNUH amendment form",
  doc_type: "amendment",
  filename: "amend.docx",
  is_global: false,
  status: "ready",
  hospital_ids: [1],
  fields: [TEXT, CHOICE],
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  archived_at: null,
};

const state = vi.hoisted(() => ({
  offered: [] as unknown[],
  checked: [] as string[],
  checkError: null as unknown,
  created: [] as unknown[],
  saved: [] as unknown[],
  library: [] as unknown[],
  detected: [] as unknown[],
  fieldSaves: [] as unknown[],
  detail: null as unknown,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/admin/templates",
}));

vi.mock("@/lib/draft-picker", async () => ({
  ...(await vi.importActual<typeof import("../src/lib/draft-picker")>("../src/lib/draft-picker")),
  pickerSources: async () => [{ id: 1, name: "Public board", requires_login: false, ai_enabled: true }],
  pickerTitles: async (ids: number[]) => new Map(ids.map((i) => [i, `Title ${i}`])),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    hospitals: async () => ({
      hospitals: [{ id: 1, name: "SNUH", note: "", created_at: "", updated_at: "", boards: [{ id: 11, name: "Public board" }] }],
      board_kinds: ["notice", "forms", "regulations", "other"],
    }),
  },
}));

vi.mock("@/lib/api/docgen", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/docgen")>("../src/lib/api/docgen");
  return {
    ...actual,
    toUpload: async (file: File) => ({ filename: file.name, content_base64: "eA==" }),
    docgenApi: {
      templates: async () => state.offered,
      checkTemplate: async (file: { filename: string }) => {
        state.checked.push(file.filename);
        if (state.checkError) throw state.checkError;
        return { filename: file.filename, fields: [TEXT, CHOICE] };
      },
      adminTemplates: async () => state.library,
      createTemplate: async (title: string, docType: string, file: { filename: string }) => {
        state.created.push([title, docType, file.filename]);
        return { ...TEMPLATE, id: 9, status: "review" };
      },
      detectedFields: async () => state.detected,
      saveTemplateFields: async (id: number, edits: unknown) => {
        state.fieldSaves.push([id, edits]);
        return TEMPLATE;
      },
      get: async () => state.detail,
      saveFields: async (_id: string, fields: unknown, base: number) => {
        state.saved.push([fields, base]);
        const detail = state.detail as DraftDetail;
        const v = { version_no: 2, markdown: "# x", origin: "user_edit", instruction: "", created_at: "2026-11-11T01:00:00Z", fields };
        detail.versions.push(v as DraftDetail["versions"][number]);
        return v;
      },
      defaultGuides: async () => [],
      exportDocx: async () => ({ blob: new Blob(["x"]), filename: "a.docx" }),
    },
  };
});

function wrap(node: React.ReactNode, messages: typeof en = en) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.offered = [TEMPLATE];
  state.checked = [];
  state.checkError = null;
  state.created = [];
  state.saved = [];
  state.library = [];
  state.detected = [TEXT, CHOICE];
  state.fieldSaves = [];
  state.detail = null;
});
afterEach(cleanup);

// ---- helpers --------------------------------------------------------------------------------

describe("helpers", () => {
  it("decides when a form choice can be sent", () => {
    expect(formReady(NO_FORM, undefined)).toBe(true);
    expect(formReady({ kind: "list", id: 7 }, [TEMPLATE])).toBe(true);
    expect(formReady({ kind: "list", id: 8 }, [TEMPLATE])).toBe(false); // not offered now
    expect(formReady({ kind: "list", id: 7 }, undefined)).toBe(false); // list not loaded
    expect(formReady({ kind: "file", file: null, fields: null }, [])).toBe(false);
    const file = new File(["x"], "f.docx");
    expect(formReady({ kind: "file", file, fields: null }, [])).toBe(false); // still checking
    expect(formReady({ kind: "file", file, fields: [TEXT] }, [])).toBe(true);
  });

  it("builds the request part", async () => {
    expect(await formRequest(NO_FORM)).toEqual({});
    expect(await formRequest({ kind: "list", id: 7 })).toEqual({ template_id: 7 });
    const file = new File(["x"], "f.docx");
    expect(await formRequest({ kind: "file", file, fields: [] })).toEqual({ template_file: { filename: "f.docx", content_base64: "eA==" } });
  });

  it("ticks one option, or several in the form's order", () => {
    expect(toggleOption(CHOICE, ["New"], "Change", true)).toEqual(["Change"]);
    expect(toggleOption(MULTI, ["CRF"], "Protocol", true)).toEqual(["Protocol", "CRF"]);
    expect(toggleOption(MULTI, ["Protocol", "CRF"], "CRF", false)).toEqual(["Protocol"]);
  });

  it("compares answers and reads picks", () => {
    expect(sameAnswers({ a: "x", b: ["1"] }, { a: "x", b: ["1"] })).toBe(true);
    expect(sameAnswers({ a: "x" }, { a: "y" })).toBe(false);
    expect(sameAnswers({ a: "" }, {})).toBe(false); // emptied on purpose differs from unanswered
    expect(sameAnswers({ b: ["1", "2"] }, { b: ["2", "1"] })).toBe(false);
    expect(pickedOf(undefined)).toEqual([]);
    expect(pickedOf("New")).toEqual(["New"]);
  });

  it("only takes .docx forms within the size", () => {
    expect(templateFileProblem(new File(["x"], "a.hwp"))).toBe("type");
    expect(templateFileProblem(new File([], "a.docx"))).toBe("empty");
    expect(templateFileProblem(new File(["x"], "A.DOCX"))).toBeNull();
  });

  it("builds the field check from the detected list and the saved one", () => {
    const rows = reviewRows([TEXT, CHOICE], [{ ...CHOICE, label: "Kind", multi: true }]);
    expect(rows.map((r) => [r.keep, r.label, r.multi])).toEqual([
      [false, "Study title", false],
      [true, "Kind", true],
    ]);
    expect(editsOf(rows)).toEqual([{ key: "c:body/1", label: "Kind", hint: "", multi: true }]);
  });

  it("has every new message in both languages", () => {
    const keysOf = (o: Record<string, unknown>) => Object.keys(o).sort();
    expect(keysOf(ko.drafts.form)).toEqual(keysOf(en.drafts.form));
    expect(keysOf(ko.admin.templates)).toEqual(keysOf(en.admin.templates));
  });
});

// ---- the draft form's choice ------------------------------------------------------------------

// The picker driven with its own state, like on the page.
function Picker({ initial = NO_FORM, onPick }: { initial?: FormPick; onPick?: (p: FormPick) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <FormChoice
      sourceIds={[1]}
      value={value}
      onChange={(p) => {
        setValue(p);
        onPick?.(p);
      }}
    />
  );
}

describe("FormChoice", () => {
  it("lists the offered forms and shows a chosen one's fields", async () => {
    wrap(<Picker />);
    const select = await screen.findByRole("combobox", { name: "Form" });
    await screen.findByRole("option", { name: /SNUH amendment form \(amendment\)/ });
    fireEvent.change(select, { target: { value: "list:7" } });
    expect(await screen.findByText(/amend.docx: 2 fields to fill/)).toBeTruthy();
    expect(screen.getByText("Study title")).toBeTruthy();
  });

  it("checks an attached form with the server before it can be used", async () => {
    const picks: FormPick[] = [];
    wrap(<Picker onPick={(p) => picks.push(p)} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Form" }), { target: { value: "file" } });
    const input = await screen.findByLabelText(/Form file/);
    fireEvent.change(input, { target: { files: [new File(["x"], "mine.docx")] } });
    expect(await screen.findByText(/2 fields were found/)).toBeTruthy();
    expect(state.checked).toEqual(["mine.docx"]);
    expect(picks.at(-1)).toMatchObject({ kind: "file", fields: [TEXT, CHOICE] });
  });

  it("refuses a non-docx file with how to fix it, and shows the server's reason", async () => {
    wrap(<Picker />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Form" }), { target: { value: "file" } });
    const input = await screen.findByLabelText(/Form file/);
    fireEvent.change(input, { target: { files: [new File(["x"], "form.hwp")] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/save it as .docx/);
    expect(state.checked).toEqual([]);
    state.checkError = new Error("boom");
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.docx")] } });
    await waitFor(() => expect(state.checked).toEqual(["bad.docx"]));
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });

  it("says so when the chosen form is not offered for the documents chosen now", async () => {
    state.offered = [];
    wrap(<Picker initial={{ kind: "list", id: 7 }} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/not offered for the documents chosen now/);
  });
});

// ---- the field editor ------------------------------------------------------------------------

describe("FieldEditor", () => {
  it("edits text answers and picks options", () => {
    const changes: unknown[] = [];
    wrap(<FieldEditor fields={[TEXT, CHOICE]} values={{ "c:body/1": ["New"] }} readOnly={false} onChange={(v) => changes.push(v)} />);
    expect((screen.getByLabelText(/Study title/) as HTMLTextAreaElement).placeholder).toBe("Not answered yet");
    fireEvent.change(screen.getByLabelText(/Study title/), { target: { value: "Heart study" } });
    fireEvent.click(screen.getByRole("radio", { name: "Change" }));
    expect(changes).toEqual([
      { "c:body/1": ["New"], "m:title": "Heart study" },
      { "c:body/1": ["Change"] },
    ]);
  });
});

// ---- a template draft in the editor -----------------------------------------------------------

function templateDraft(): DraftDetail {
  return {
    draft: {
      id: "d1",
      title: "Amendment",
      instruction: "",
      documents: [{ document_id: 10, version_no: 2, source_id: 1 }],
      guide_ids: [],
      extra_guides: [],
      ai_override_source_ids: [],
      created_at: "2026-11-11T00:00:00Z",
      updated_at: "2026-11-11T00:00:00Z",
      template: { template_id: 7, title: "SNUH amendment form", filename: "amend.docx", fields: [TEXT, CHOICE] },
    },
    versions: [
      { version_no: 1, markdown: "# Amendment", origin: "ai", instruction: "", created_at: "2026-11-11T00:00:00Z", fields: { "m:title": "Heart study", "c:body/1": ["New"] } },
    ],
    guides: [],
  };
}

describe("DraftEditor with a form", () => {
  it("shows one box per field and saves the answers as a new version", async () => {
    state.detail = templateDraft();
    wrap(<DraftEditor id="d1" />);
    const box = (await screen.findByLabelText(/Study title/)) as HTMLTextAreaElement;
    expect(box.value).toBe("Heart study");
    expect(screen.queryByRole("textbox", { name: "Edit" })).toBeNull(); // no Markdown box
    expect(screen.getByRole("button", { name: /Download filled form/ })).toBeTruthy();
    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save as new version" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Heart failure study" } });
    fireEvent.click(screen.getByRole("radio", { name: "Change" }));
    fireEvent.click(save);
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]).toEqual([{ "m:title": "Heart failure study", "c:body/1": ["Change"] }, 1]);
    expect(await screen.findByText("Saved as version 2.")).toBeTruthy();
  });
});

// ---- the admin library -----------------------------------------------------------------------

describe("TemplateLibrary", () => {
  it("uploads a form and refuses other formats", async () => {
    wrap(<TemplateLibrary />);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Form A" } });
    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "amendment" } });
    const file = screen.getByLabelText(/File \(.docx/);
    fireEvent.change(file, { target: { files: [new File(["x"], "a.hwp")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/must be a .docx/);
    fireEvent.change(file, { target: { files: [new File(["x"], "a.docx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(state.created).toEqual([["Form A", "amendment", "a.docx"]]));
    expect((await screen.findByRole("status")).textContent).toMatch(/2 fields found/);
  });

  it("opens the field check of a new form and saves the kept fields", async () => {
    state.library = [{ ...TEMPLATE, status: "review", fields: [TEXT, CHOICE] }];
    wrap(<TemplateLibrary />);
    expect(await screen.findByText("Fields not checked")).toBeTruthy();
    const label = await screen.findByLabelText("Label of m:title");
    fireEvent.change(label, { target: { value: "연구 제목" } });
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Fill" })[1]); // drop the tick boxes
    expect(screen.getByText("1 of 2 fields kept")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save fields" }));
    await waitFor(() => expect(state.fieldSaves).toHaveLength(1));
    expect(state.fieldSaves[0]).toEqual([7, [{ key: "m:title", label: "연구 제목", hint: "Korean", multi: false }]]);
  });

  it("will not save an empty field list", async () => {
    state.library = [{ ...TEMPLATE, status: "review" }];
    wrap(<TemplateLibrary />);
    for (const box of await screen.findAllByRole("checkbox", { name: "Fill" })) fireEvent.click(box);
    expect(screen.getByText("Keep at least one field.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save fields" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
