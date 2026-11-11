import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { OrganizationAdmin } from "../src/components/admin/organization-admin";
import { ApiError } from "../src/lib/api/client";
import { currentMonth, type Organization } from "../src/lib/api/organizations";

const DEFAULT: Organization = {
  id: "d",
  name: "Default",
  created_at: "2026-11-11T00:00:00Z",
  deleted_at: null,
  member_count: 2,
  is_default: true,
};
const ACME: Organization = { ...DEFAULT, id: "a", name: "Acme", member_count: 0, is_default: false };
const ZERO = { chat_messages: 0, summaries: 0, drafts: 0, revisions: 0, exports: 0, downloads: 0 };

const state = vi.hoisted(() => ({
  orgs: [] as unknown[],
  created: [] as string[],
  removed: [] as string[],
  moved: [] as unknown[],
  removeError: null as unknown,
  statsMonths: [] as string[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/lib/api/organizations", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/organizations")>("../src/lib/api/organizations");
  return {
    ...actual,
    orgApi: {
      list: async (includeDeleted: boolean) =>
        (state.orgs as Organization[]).filter((o) => includeDeleted || o.deleted_at === null),
      create: async (name: string) => {
        state.created.push(name);
        return { ...ACME, id: "n", name };
      },
      rename: async (id: string, name: string) => ({ ...ACME, id, name }),
      remove: async (id: string) => {
        if (state.removeError) throw state.removeError;
        state.removed.push(id);
        return { ...ACME, deleted_at: "2026-11-11T00:00:00Z" };
      },
      restore: async () => ACME,
      members: async (id: string) =>
        id === "d"
          ? [
              { user_id: "u1", email: "a@example.com", display_name: null, role: "user", created_at: "", deleted_at: null },
              { user_id: "u0", email: "boss@example.com", display_name: null, role: "admin", created_at: "", deleted_at: null },
            ]
          : [],
      moveUser: async (userId: string, orgId: string) => {
        state.moved.push([userId, orgId]);
        return {};
      },
      monthStats: async (month: string) => {
        state.statsMonths.push(month);
        return {
          month,
          organizations: [
            { organization_id: "d", name: "Default", deleted: false, members: 2, new_accounts: 1, signed_in: 1, counts: { ...ZERO, chat_messages: 12 } },
            { organization_id: "a", name: "Acme", deleted: false, members: 0, new_accounts: 0, signed_in: 0, counts: ZERO },
          ],
        };
      },
      orgStats: async (id: string, month: string) => ({
        month,
        organization: DEFAULT,
        totals: {},
        users: [
          { user_id: "u1", email: "a@example.com", member_now: true, last_sign_in_at: "2026-11-05T00:00:00Z", counts: { ...ZERO, chat_messages: 12 } },
          { user_id: "u9", email: "old@example.com", member_now: false, last_sign_in_at: null, counts: { ...ZERO, downloads: 1 } },
        ],
      }),
    },
  };
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.orgs = [DEFAULT, ACME, { ...ACME, id: "g", name: "Gone", deleted_at: "2026-11-01T00:00:00Z" }];
  state.created = [];
  state.removed = [];
  state.moved = [];
  state.removeError = null;
  state.statsMonths = [];
});

afterEach(cleanup);

describe("currentMonth", () => {
  it("uses Seoul time", () => {
    // 2026-11-30 16:00 UTC is already December 1st in Seoul.
    expect(currentMonth(new Date("2026-11-30T16:00:00Z"))).toBe("2026-12");
    expect(currentMonth(new Date("2026-11-30T14:00:00Z"))).toBe("2026-11");
  });
});

describe("OrganizationAdmin", () => {
  it("lists live organizations, Default without a delete button", async () => {
    wrap(<OrganizationAdmin />);
    const list = await screen.findByRole("heading", { name: "All organizations" });
    const section = list.closest("section") as HTMLElement;
    await within(section).findByText("Acme");
    expect(within(section).queryByText("Gone")).toBeNull();
    const defaultRow = within(section).getByText("Default", { selector: "span.font-medium" }).closest("li") as HTMLElement;
    expect(within(defaultRow).queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(within(section).getByLabelText("Show deleted organizations"));
    await within(section).findByText("Gone");
    expect(within(section).getByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("adds an organization and refuses an empty name", async () => {
    wrap(<OrganizationAdmin />);
    const add = await screen.findByRole("button", { name: "Add" });
    fireEvent.click(add);
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a name.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Beta " } });
    fireEvent.click(add);
    await screen.findByText('Organization "Beta" added.');
    expect(state.created).toEqual(["Beta"]);
  });

  it("shows the server's reason when a delete is refused", async () => {
    state.removeError = new ApiError(409, "move its 1 user(s) to another organization first");
    wrap(<OrganizationAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("move its 1 user(s)");
    expect(state.removed).toEqual([]);
  });

  it("moves a user to another live organization", async () => {
    wrap(<OrganizationAdmin />);
    const buttons = await screen.findAllByRole("button", { name: "Users" });
    fireEvent.click(buttons[0]);
    await screen.findByText("a@example.com");
    const moveButtons = screen.getAllByRole("button", { name: "Move" });
    fireEvent.click(moveButtons[0]);
    expect((await screen.findByRole("alert")).textContent).toContain("Choose the organization");
    const select = screen.getAllByLabelText("Move to…")[0] as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Move to…", "Acme"]);
    fireEvent.change(select, { target: { value: "a" } });
    fireEvent.click(moveButtons[0]);
    await screen.findByText(/a@example.com moved to Acme/);
    expect(state.moved).toEqual([["u1", "a"]]);
  });

  it("shows this month's statistics and one organization's users", async () => {
    wrap(<OrganizationAdmin />);
    const stats = (await screen.findByRole("heading", { name: "Monthly statistics" })).closest("section") as HTMLElement;
    await within(stats).findByText("12");
    expect(state.statsMonths[0]).toBe(currentMonth());
    fireEvent.click(within(stats).getByRole("button", { name: "Default" }));
    await within(stats).findByText("Users of Default");
    expect(within(stats).getByText("(moved or deleted since)")).toBeTruthy();
    expect(within(stats).getByText("2026-11-05")).toBeTruthy();
  });

  it("refuses a future month without calling the server", async () => {
    wrap(<OrganizationAdmin />);
    const input = await screen.findByLabelText("Month");
    fireEvent.change(input, { target: { value: "2999-01" } });
    expect((await screen.findByText("Choose this month or an earlier one."))).toBeTruthy();
    expect(state.statsMonths).not.toContain("2999-01");
  });
});
