import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { UserAdmin } from "../src/components/admin/user-admin";
import { ApiError } from "../src/lib/api/client";
import { newUserProblem, type AdminUser } from "../src/lib/api/users";

const USER: AdminUser = {
  id: "u1",
  email: "a@example.com",
  display_name: "Kim",
  role: "user",
  created_at: "2026-11-11T00:00:00Z",
  deleted_at: null,
  organization_id: "d",
  organization_name: "Default",
};

const state = vi.hoisted(() => ({
  users: [] as unknown[],
  created: [] as unknown[],
  createError: null as unknown,
  calls: [] as unknown[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

vi.mock("@/lib/api/organizations", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/organizations")>("../src/lib/api/organizations");
  const base = { created_at: "", deleted_at: null, member_count: 1 };
  return {
    ...actual,
    orgApi: {
      list: async () => [
        { ...base, id: "d", name: "Default", is_default: true },
        { ...base, id: "a", name: "Acme", is_default: false },
      ],
    },
  };
});

vi.mock("@/lib/api/users", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/users")>("../src/lib/api/users");
  return {
    ...actual,
    usersApi: {
      list: async (_offset: number, includeDeleted: boolean) => {
        const items = (state.users as AdminUser[]).filter((u) => includeDeleted || !u.deleted_at);
        return { items, total: items.length, limit: 50, offset: 0 };
      },
      create: async (body: { email: string; organization_id: string }) => {
        if (state.createError) throw state.createError;
        state.created.push(body);
        return { ...USER, id: "n", email: body.email, organization_name: body.organization_id === "a" ? "Acme" : "Default" };
      },
      setRole: async (id: string, role: string) => {
        state.calls.push(["role", id, role]);
        return USER;
      },
      remove: async (id: string) => {
        state.calls.push(["remove", id]);
        return USER;
      },
      restore: async (id: string) => {
        state.calls.push(["restore", id]);
        return USER;
      },
      move: async (id: string, org: string) => {
        state.calls.push(["move", id, org]);
        return USER;
      },
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
  state.users = [USER, { ...USER, id: "u2", email: "gone@example.com", deleted_at: "2026-11-01T00:00:00Z" }];
  state.created = [];
  state.createError = null;
  state.calls = [];
});

afterEach(cleanup);

describe("newUserProblem", () => {
  const ok = { email: "a@b.co", password: "12345678", display_name: null, role: "user" as const, organization_id: null };
  it("checks email and password length", () => {
    expect(newUserProblem(ok)).toBeNull();
    expect(newUserProblem({ ...ok, email: "nope" })).toBe("email");
    expect(newUserProblem({ ...ok, password: "1234567" })).toBe("password");
  });
});

describe("UserAdmin", () => {
  it("creates a user in the picked organization, Default preselected", async () => {
    wrap(<UserAdmin />);
    const form = (await screen.findByRole("heading", { name: "Create a user" })).closest("section") as HTMLElement;
    const org = (await within(form).findByLabelText("Organization")) as HTMLSelectElement;
    await within(form).findByRole("option", { name: "Acme" });
    expect(org.value).toBe("d");
    fireEvent.change(within(form).getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(within(form).getByLabelText("Temporary password"), { target: { value: "short" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    expect((await within(form).findByRole("alert")).textContent).toContain("at least 8");
    expect(state.created).toEqual([]);
    fireEvent.change(within(form).getByLabelText("Temporary password"), { target: { value: "long-enough" } });
    fireEvent.change(org, { target: { value: "a" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    await within(form).findByText(/new@example.com created in Acme/);
    expect(state.created).toEqual([
      { email: "new@example.com", password: "long-enough", display_name: null, role: "user", organization_id: "a" },
    ]);
    expect((within(form).getByLabelText("Temporary password") as HTMLInputElement).value).toBe("");
  });

  it("shows the server's reason when creating fails", async () => {
    state.createError = new ApiError(409, "a user with this email already exists");
    wrap(<UserAdmin />);
    const form = (await screen.findByRole("heading", { name: "Create a user" })).closest("section") as HTMLElement;
    fireEvent.change(within(form).getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(within(form).getByLabelText("Temporary password"), { target: { value: "long-enough" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    expect((await within(form).findByRole("alert")).textContent).toBe("a user with this email already exists");
  });

  it("lists users with organization, hides deleted ones until asked", async () => {
    wrap(<UserAdmin />);
    const list = (await screen.findByRole("heading", { name: "All users" })).closest("section") as HTMLElement;
    await within(list).findByText("a@example.com");
    expect(within(list).getByText("Default")).toBeTruthy();
    expect(within(list).queryByText("gone@example.com")).toBeNull();
    fireEvent.click(within(list).getByLabelText("Show deleted users"));
    await within(list).findByText("gone@example.com");
    fireEvent.click(within(list).getByRole("button", { name: "Restore" }));
    await within(list).findByText(/can sign in again/);
    expect(state.calls).toContainEqual(["restore", "u2"]);
  });

  it("asks once more before deleting", async () => {
    wrap(<UserAdmin />);
    const list = (await screen.findByRole("heading", { name: "All users" })).closest("section") as HTMLElement;
    fireEvent.click(await within(list).findByRole("button", { name: "Delete" }));
    expect(state.calls).toEqual([]);
    fireEvent.click(within(list).getByRole("button", { name: "Confirm delete" }));
    await within(list).findByText(/login is blocked/);
    expect(state.calls).toEqual([["remove", "u1"]]);
  });

  it("changes role and moves organization", async () => {
    wrap(<UserAdmin />);
    const list = (await screen.findByRole("heading", { name: "All users" })).closest("section") as HTMLElement;
    fireEvent.click(await within(list).findByRole("button", { name: "Make admin" }));
    await within(list).findByText("Now an admin.");
    const select = within(list).getByLabelText("Move to…") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Move to…", "Acme"]);
    fireEvent.change(select, { target: { value: "a" } });
    fireEvent.click(within(list).getByRole("button", { name: "Move" }));
    await within(list).findByText(/moved to Acme/);
    expect(state.calls).toEqual([["role", "u1", "admin"], ["move", "u1", "a"]]);
  });
});
