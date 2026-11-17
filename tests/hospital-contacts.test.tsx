import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { ContactsToggle, HospitalContacts } from "../src/components/hospital-contacts";
import type { ContactsRow } from "../src/lib/api/contacts";

const state = vi.hoisted(() => ({
  row: null as unknown,
  error: null as unknown,
  reads: 0,
  saved: [] as unknown[],
  saveError: null as Error | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) builder[m] = () => builder;
      builder.maybeSingle = async () => {
        state.reads += 1;
        return { data: state.row, error: state.error };
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/api/contacts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api/contacts")>();
  return {
    ...actual,
    contactsApi: {
      save: async (id: number, body: unknown) => {
        if (state.saveError) throw state.saveError;
        state.saved.push([id, body]);
        return {};
      },
    },
  };
});

const base: ContactsRow = {
  hospital_id: 4, scanned_phone: "- A: 02-1\n- B: 02-2", scanned_fax: "없음", scanned_email: "irb@x.kr | _",
  manual_phone: null, manual_fax: null, manual_email: null, check_status: "ok", checked_at: "2026-11-17T04:00:00Z",
  last_ok_at: "2026-11-17T04:00:00Z", error_kind: null, staff: [], staff_status: "none", staff_error_kind: null,
};

function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.row = base;
  state.error = null;
  state.reads = 0;
  state.saved = [];
  state.saveError = null;
});
afterEach(cleanup);

describe("HospitalContacts", () => {
  it("shows the three fields as the hospital wrote them, and the check date", async () => {
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText(/A: 02-1/)).toBeTruthy();
    expect(screen.getByText("없음")).toBeTruthy();
    expect(screen.getByText(/irb@x.kr/)).toBeTruthy();
    expect(screen.getByText(/Read from R-BAY on/)).toBeTruthy();
  });

  it("never turns contact text into a link", async () => {
    show(<HospitalContacts hospitalId={4} />);
    await screen.findByText(/A: 02-1/);
    expect(document.querySelectorAll("a").length).toBe(0);
  });

  it("an empty field says none is listed; a typed field says an admin entered it", async () => {
    state.row = { ...base, scanned_fax: "", manual_phone: "02-999" };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText("02-999")).toBeTruthy();
    expect(screen.getByText("entered by an admin")).toBeTruthy();
    expect(screen.getByText("none listed on R-BAY")).toBeTruthy();
  });

  it("a hospital with no row says it was not read yet", async () => {
    state.row = null;
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText("Not read from R-BAY yet.")).toBeTruthy();
    expect(screen.getAllByText("none listed on R-BAY").length).toBe(3);
  });

  it("a failed check says why, with the short reason, and still shows the old texts", async () => {
    state.row = { ...base, check_status: "failed", error_kind: "layout_changed" };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText(/the page layout changed/)).toBeTruthy();
    expect(screen.getByText(/A: 02-1/)).toBeTruthy(); // saved texts are not hidden
  });

  it("a failed first check says nothing has been read", async () => {
    state.row = { ...base, check_status: "failed", error_kind: "site_unavailable", last_ok_at: null, scanned_phone: "" };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText(/nothing has been read yet/)).toBeTruthy();
  });

  it("a read error is shown, never an empty block", async () => {
    state.error = { message: "down" };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load the contacts.")).toBeTruthy();
  });

  it("lists the people by task and tab, as plain text", async () => {
    state.row = {
      ...base, staff_status: "ok",
      staff: [{ tab: "IRB", entries: [{ title: "접수", name: "<b>간사</b>", email: "(평일 08:30)", tel: "02-3" }] }],
    };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText("Who to ask about what")).toBeTruthy();
    expect(screen.getByText("IRB")).toBeTruthy();
    expect(screen.getByText("<b>간사</b>")).toBeTruthy(); // text, not markup
    expect(screen.getByText("(평일 08:30)")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });

  it("says a failed manager-page read may have left an old list", async () => {
    state.row = { ...base, staff_status: "failed", staff_error_kind: "site_unavailable", staff: [] };
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText(/could not be read last time \(the site could not be reached\)/)).toBeTruthy();
  });

  it("says when the hospital has no manager page", async () => {
    show(<HospitalContacts hospitalId={4} />);
    expect(await screen.findByText("This hospital has no task contact page on R-BAY.")).toBeTruthy();
  });

  it("only an admin gets the edit button", async () => {
    const { unmount } = show(<HospitalContacts hospitalId={4} />);
    await screen.findByText(/A: 02-1/);
    expect(screen.queryByText("Edit contacts")).toBeNull();
    unmount();
    show(<HospitalContacts hospitalId={4} canEdit />);
    expect(await screen.findByText("Edit contacts")).toBeTruthy();
  });

  it("an admin saves typed fields; a blank field is sent so the server clears it", async () => {
    state.row = { ...base, manual_phone: "02-999" };
    show(<HospitalContacts hospitalId={4} canEdit />);
    fireEvent.click(await screen.findByText("Edit contacts"));
    const boxes = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    expect(boxes[0].value).toBe("02-999"); // the typed text, not the scanned one
    expect(boxes[0].placeholder).toContain("A: 02-1"); // the scanned text shows as the hint
    fireEvent.change(boxes[0], { target: { value: "" } });
    fireEvent.change(boxes[2], { target: { value: "new@x.kr" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(state.saved).toEqual([[4, { phone: "", fax: "", email: "new@x.kr" }]]));
  });

  it("a failed save keeps the form open and says why", async () => {
    state.saveError = new Error("403 forbidden");
    show(<HospitalContacts hospitalId={4} canEdit />);
    fireEvent.click(await screen.findByText("Edit contacts"));
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("Could not save: 403 forbidden")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });
});

describe("ContactsToggle", () => {
  it("reads nothing until the user opens it", async () => {
    show(<ContactsToggle hospitalId={4} />);
    expect(state.reads).toBe(0);
    fireEvent.click(screen.getByText("Show the hospital's IRB contacts"));
    expect(await screen.findByText(/A: 02-1/)).toBeTruthy();
    expect(state.reads).toBe(1);
    fireEvent.click(screen.getByText("Hide the contacts"));
    expect(screen.queryByText(/A: 02-1/)).toBeNull();
  });
});
