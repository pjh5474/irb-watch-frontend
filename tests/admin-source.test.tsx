import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AdminSource } from "../src/components/admin/admin-source";
import { ApiError } from "../src/lib/api/client";
import type { AdminSource as Source } from "../src/lib/api/admin";

// Plain functions instead of vi.fn(): vitest reports a rejected promise returned by a spy as
// an unhandled error even though the component handles it.
const api = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  source: null as unknown,
  logins: [] as unknown[],
  members: [] as unknown[],
  saveError: null as unknown,
  addError: null as unknown,
}));

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

vi.mock("@/lib/api/admin", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/admin")>("../src/lib/api/admin");
  return {
    ...actual,
    adminApi: {
      sources: async () => [api.source],
      updateSource: async (...a: unknown[]) => {
        api.calls.push(["updateSource", ...a]);
        return api.source;
      },
      scanSource: async (...a: unknown[]) => {
        api.calls.push(["scanSource", ...a]);
        return { status: "started" };
      },
      logins: async () => api.logins,
      saveLogin: async (...a: unknown[]) => {
        api.calls.push(["saveLogin", ...a]);
        if (api.saveError) throw api.saveError;
        return {};
      },
      deleteLogin: async (...a: unknown[]) => {
        api.calls.push(["deleteLogin", ...a]);
      },
      members: async () => api.members,
      addMember: async (...a: unknown[]) => {
        api.calls.push(["addMember", ...a]);
        if (api.addError) throw api.addError;
        return {};
      },
      removeMember: async (...a: unknown[]) => {
        api.calls.push(["removeMember", ...a]);
      },
    },
  };
});

const STUDY: Source = {
  id: 5,
  name: "Study 1",
  adapter: "snuh_hrpp",
  url: "https://hrpp.snuh.org/hrpp/bbs/list.do?key=2605277031",
  needs_browser: false,
  is_active: true,
  created_at: "2026-11-09T00:00:00+00:00",
  last_scan_at: null,
  last_scan_status: null,
  last_scan_error: null,
  scan_in_progress: false,
  login_user: "study-1",
  requires_login: true,
  scans_paused_reason: null,
  ai_enabled: false,
};

function show(id = 5) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <AdminSource id={id} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const called = (name: string) => api.calls.filter((c) => c[0] === name);

beforeEach(() => {
  api.calls.length = 0;
  api.source = STUDY;
  api.logins = [];
  api.members = [];
  api.saveError = null;
  api.addError = null;
});
afterEach(cleanup);

describe("study account", () => {
  it("saves the login under the label and the board's site, then clears the password", async () => {
    show();
    expect(await screen.findByText(/No login is stored yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Hospital login ID"), { target: { value: "study_id" } });
    const password = screen.getByLabelText("Hospital password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.change(password, { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save login" }));
    expect(await screen.findByText("Login saved.")).toBeTruthy();
    expect(called("saveLogin")).toEqual([["saveLogin", "study-1", "snuh-2605277031", "study_id", "s3cret"]]);
    expect(password.value).toBe(""); // never kept after it was sent
    expect((screen.getByLabelText("Hospital login ID") as HTMLInputElement).value).toBe("");
  });

  it("two clicks in the same instant send the login once", async () => {
    show();
    await screen.findByText(/No login is stored yet/);
    fireEvent.change(screen.getByLabelText("Hospital login ID"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Hospital password"), { target: { value: "b" } });
    const button = screen.getByRole("button", { name: "Save login" });
    act(() => {
      button.click();
      button.click();
    });
    await screen.findByText("Login saved.");
    expect(called("saveLogin")).toHaveLength(1);
  });

  it("shows the server's reason when saving fails", async () => {
    api.saveError = new ApiError(409, "managing credentials over the API needs CREDENTIAL_STORE=database on this server");
    show();
    await screen.findByText(/No login is stored yet/);
    fireEvent.change(screen.getByLabelText("Hospital login ID"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Hospital password"), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save login" }));
    expect(await screen.findByText(/needs CREDENTIAL_STORE=database/)).toBeTruthy();
  });

  it("says a login is stored without ever showing it, and asks before deleting", async () => {
    api.logins = [{ owner_label: "study-1", site: "snuh-2605277031", updated_at: "2026-11-09T01:00:00+00:00" }];
    show();
    expect(await screen.findByText(/A login is stored/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete stored login" }));
    expect(called("deleteLogin")).toHaveLength(0); // not yet
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(called("deleteLogin")).toEqual([["deleteLogin", "study-1", "snuh-2605277031"]]));
  });
});

describe("AI switch", () => {
  it("asks before turning AI on for a study", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Turn AI on" }));
    expect(screen.getByText(/Study documents may be confidential/)).toBeTruthy();
    expect(called("updateSource")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(called("updateSource")).toEqual([["updateSource", 5, { ai_enabled: true }]]));
  });

  it("turns AI off in one click", async () => {
    api.source = { ...STUDY, ai_enabled: true };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Turn AI off" }));
    await waitFor(() => expect(called("updateSource")).toEqual([["updateSource", 5, { ai_enabled: false }]]));
  });
});

describe("members", () => {
  it("adds a user by email and shows the server's refusal for an unknown one", async () => {
    show();
    expect(await screen.findByText(/Nobody is assigned yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("User email"), { target: { value: "u@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByText("User added.")).toBeTruthy();
    expect(called("addMember")).toEqual([["addMember", 5, "u@example.com"]]);

    api.addError = new ApiError(404, "no active user with that email");
    fireEvent.change(screen.getByLabelText("User email"), { target: { value: "x@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByText("no active user with that email")).toBeTruthy();
  });

  it("asks before removing someone", async () => {
    api.members = [{ user_id: "user-1", email: "u@example.com", display_name: null, added_at: "2026-11-09T00:00:00+00:00" }];
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(called("removeMember")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(called("removeMember")).toEqual([["removeMember", 5, "user-1"]]));
  });

  it("a public source has no members section and offers to make it a study", async () => {
    api.source = { ...STUDY, login_user: null, requires_login: false, ai_enabled: true };
    show();
    expect(await screen.findByText("Make this a members-only study")).toBeTruthy();
    expect(screen.queryByText("Who can read this study")).toBeNull();
  });
});
