import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { HospitalAdmin } from "../src/components/admin/hospital-admin";
import { ApiError } from "../src/lib/api/client";

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  createError: null as unknown,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => "/admin/hospitals",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

vi.mock("@/lib/api/admin", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/admin")>("../src/lib/api/admin");
  return {
    ...actual,
    adminApi: {
      hospitals: async () => ({
        hospitals: [
          {
            id: 1,
            name: "Kimpo Woori",
            note: "",
            created_at: "",
            updated_at: "",
            boards: [
              { id: 85, name: "Kimpo : rules", adapter: "rbay", board_kind: "regulations", is_active: true, requires_login: true },
              { id: 86, name: "Kimpo : forms", adapter: "rbay", board_kind: "forms", is_active: false, requires_login: true },
            ],
          },
          { id: 2, name: "Naeun", note: "manual", created_at: "", updated_at: "", boards: [] },
        ],
        board_kinds: ["notice", "forms", "regulations", "other"],
      }),
      createHospital: async (body: unknown) => {
        state.calls.push(["create", body]);
        if (state.createError) throw state.createError;
        return { id: 3, name: "Ewha", note: "", created_at: "", updated_at: "", boards: [] };
      },
      updateHospital: async (id: number, body: unknown) => {
        state.calls.push(["updateHospital", id, body]);
        return {};
      },
      updateSource: async (id: number, body: unknown) => {
        state.calls.push(["updateSource", id, body]);
        return {};
      },
    },
  };
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <HospitalAdmin />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.calls = [];
  state.createError = null;
});
afterEach(cleanup);

describe("HospitalAdmin", () => {
  it("lists hospitals with their boards and kinds", async () => {
    show();
    expect(await screen.findByText("2 boards")).toBeTruthy();
    expect(screen.getByText("Kimpo Woori", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("2 hospitals")).toBeTruthy();
    expect(screen.getByText("No boards yet.")).toBeTruthy();
    expect(screen.getByText("Kimpo : forms · inactive")).toBeTruthy();
    const kinds = screen.getAllByLabelText("Kind") as HTMLSelectElement[];
    expect(kinds.map((k) => k.value)).toEqual(["regulations", "forms"]);
  });

  it("adds a hospital and shows the server's reason when it is refused", async () => {
    show();
    await screen.findByText("2 boards"); // the list has loaded (names also appear in the move menus)
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a name.");
    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: " Ewha " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Added Ewha.")).toBeTruthy();
    expect(state.calls).toEqual([["create", { name: "Ewha" }]]);

    state.createError = new ApiError(409, "a hospital with this name already exists");
    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: "Ewha" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already exists");
  });

  it("renames a hospital", async () => {
    show();
    await screen.findByText("2 boards"); // the list has loaded (names also appear in the move menus)
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Kimpo Woori Hospital" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.calls).toEqual([["updateHospital", 1, { name: "Kimpo Woori Hospital", note: "" }]]),
    );
  });

  it("moves a board to another hospital and changes a board's kind", async () => {
    show();
    await screen.findByText("2 boards"); // the list has loaded (names also appear in the move menus)
    fireEvent.change(screen.getAllByLabelText("Hospital")[0], { target: { value: "2" } });
    expect(await screen.findByText(/Board moved/)).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText("Kind")[1], { target: { value: "notice" } });
    await waitFor(() =>
      expect(state.calls).toEqual([
        ["updateSource", 85, { hospital_id: 2 }],
        ["updateSource", 86, { board_kind: "notice" }],
      ]),
    );
  });
});
