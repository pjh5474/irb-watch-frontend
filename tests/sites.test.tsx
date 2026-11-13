import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { SiteDetails } from "../src/components/sites/site-details";
import { siteLabel, type SiteFacts } from "../src/lib/api/sites";

const entry = (id: number, value: string, valid_from: string, extra = {}) => ({
  id, value, valid_from, step_id: null, corrects: null, corrected: false, changed_by: "Kim", created_at: "", ...extra,
});

const FACTS: SiteFacts = {
  site: { id: 30, project_id: 1, hospital_id: 4, site_no: "01", pi_name: "Shin", note: "", created_at: "", updated_at: "", deleted_at: null },
  suggested: ["CRA", "CRC"],
  facts: [
    {
      name: "PI",
      current: entry(2, "Shin", "2026-03-01"),
      upcoming: [entry(3, "Han", "2027-01-01")],
      history: [entry(3, "Han", "2027-01-01"), entry(2, "Shin", "2026-03-01"), entry(1, "Jung", "1900-01-01")],
    },
    {
      name: "CRA",
      current: entry(11, "Lee", "2026-11-01", { corrects: 10 }),
      upcoming: [entry(12, "Park", "2026-12-01")],
      history: [entry(12, "Park", "2026-12-01"), entry(11, "Lee", "2026-11-01", { corrects: 10 }), entry(10, "Leee", "2026-11-01", { corrected: true })],
    },
  ],
};

const state = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/lib/api/sites", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/sites")>("../src/lib/api/sites");
  const call = (name: string) => async (...args: unknown[]) => {
    state.calls.push([name, ...args]);
    return {};
  };
  return { ...actual, siteApi: { facts: async () => FACTS, addFact: call("addFact"), changePi: call("changePi"), update: call("update") } };
});

function show(readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        <SiteDetails siteId={30} readOnly={readOnly} steps={[{ id: 7, name: "Amendment 2" }]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.calls = [];
});
afterEach(cleanup);

describe("SiteDetails", () => {
  it("shows current and upcoming values, the PI before, and the history with corrections", async () => {
    show();
    expect(await screen.findByText("Lee")).toBeTruthy();
    expect(screen.getByText("Park from 2026-12-01")).toBeTruthy();
    expect(screen.getByText("before: Jung (until 2026-03-01)")).toBeTruthy();
    expect(screen.getByText("Han from 2027-01-01")).toBeTruthy(); // a scheduled PI change
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText(/Lee · from 2026-11-01 · by Kim · correction/)).toBeTruthy();
    // The corrected entry is struck through and cannot be corrected again.
    const old = screen.getByText(/Leee · from 2026-11-01/).closest("li") as HTMLElement;
    expect(old.className).toContain("line-through");
    expect(within(old).queryByRole("button", { name: "Correct" })).toBeNull();
  });

  it("corrects an entry, adds a dated change reported in a step, and changes the PI", async () => {
    show();
    await screen.findByText("Lee");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const lee = screen.getByText(/Lee · from 2026-11-01/).closest("li") as HTMLElement;
    fireEvent.click(within(lee).getByRole("button", { name: "Correct" }));
    const form = within(screen.getByRole("form", { name: "Add or change a detail" }));
    fireEvent.change(form.getByLabelText("Value"), { target: { value: "Lee J." } });
    fireEvent.click(form.getByRole("button", { name: "Save correction" }));
    await vi.waitFor(() =>
      expect(state.calls).toEqual([["addFact", 30, { name: "CRA", value: "Lee J.", valid_from: "2026-11-01", step_id: null, corrects: 11 }]]),
    );
    await screen.findByText("Corrected.");
    fireEvent.change(form.getByLabelText("Detail"), { target: { value: "CRC" } });
    fireEvent.change(form.getByLabelText("Value"), { target: { value: "Choi" } });
    fireEvent.change(form.getByLabelText("From"), { target: { value: "2026-11-15" } });
    fireEvent.change(form.getByLabelText("Reported in step"), { target: { value: "7" } });
    fireEvent.click(form.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(state.calls).toContainEqual(["addFact", 30, { name: "CRC", value: "Choi", valid_from: "2026-11-15", step_id: 7, corrects: null }]),
    );
    await screen.findByText("Saved.");
    fireEvent.click(screen.getByRole("button", { name: "Change PI" }));
    fireEvent.change(screen.getByLabelText("New PI"), { target: { value: "Han" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await vi.waitFor(() => expect(state.calls.some((c) => (c as unknown[])[0] === "changePi")).toBe(true));
  });

  it("read-only: no forms or buttons that change anything", async () => {
    show(true);
    await screen.findByText("Lee");
    expect(screen.queryByRole("form", { name: "Add or change a detail" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change PI" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("labels sites", () => {
    expect(siteLabel({ site_no: "01", pi_name: "Kim" })).toBe("01 · PI Kim");
    expect(siteLabel({ site_no: "", pi_name: "" })).toBe("");
  });
});
