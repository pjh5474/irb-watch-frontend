import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { ChangePassword, newPasswordProblem } from "../src/components/change-password";

const auth = vi.hoisted(() => ({
  email: "a@example.com" as string | null,
  correct: "old-password",
  signIns: [] as unknown[],
  updates: [] as unknown[],
  updateError: null as null | { message: string },
  throwOnGetUser: false,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (auth.throwOnGetUser) throw new Error("offline");
        return { data: { user: auth.email ? { email: auth.email } : null }, error: null };
      },
      signInWithPassword: async (creds: { email: string; password: string }) => {
        auth.signIns.push(creds);
        return { error: creds.password === auth.correct ? null : { message: "Invalid login credentials" } };
      },
      updateUser: async (attrs: { password: string }) => {
        auth.updates.push(attrs);
        return { error: auth.updateError };
      },
    },
  }),
}));

function fill(current: string, next: string, repeat = next) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("New password again"), { target: { value: repeat } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

function wrap() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
      <ChangePassword />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  auth.email = "a@example.com";
  auth.signIns = [];
  auth.updates = [];
  auth.updateError = null;
  auth.throwOnGetUser = false;
});

afterEach(cleanup);

describe("newPasswordProblem", () => {
  it("checks every rule in order", () => {
    expect(newPasswordProblem("", "new-password", "new-password")).toBe("current");
    expect(newPasswordProblem("old", "short", "short")).toBe("short");
    expect(newPasswordProblem("same-pass", "same-pass", "same-pass")).toBe("same");
    expect(newPasswordProblem("old", "new-password", "other-password")).toBe("repeat");
    expect(newPasswordProblem("old", "new-password", "new-password")).toBeNull();
  });
});

describe("ChangePassword", () => {
  it("checks the current password, then changes it and clears the fields", async () => {
    wrap();
    fill("old-password", "new-password");
    await screen.findByText("Your password is changed. Use it next time you sign in.");
    expect(auth.signIns).toEqual([{ email: "a@example.com", password: "old-password" }]);
    expect(auth.updates).toEqual([{ password: "new-password" }]);
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });

  it("does not change anything with a wrong current password", async () => {
    wrap();
    fill("wrong", "new-password");
    expect((await screen.findByRole("alert")).textContent).toContain("current password is wrong");
    expect(auth.updates).toEqual([]);
  });

  it("stops before any call when the new passwords differ", async () => {
    wrap();
    fill("old-password", "new-password", "new-passwordX");
    expect((await screen.findByRole("alert")).textContent).toBe("The two new passwords do not match.");
    expect(auth.signIns).toEqual([]);
  });

  it("shows Supabase's reason when the change is refused", async () => {
    auth.updateError = { message: "Password should contain at least one digit" };
    wrap();
    fill("old-password", "new-password");
    expect((await screen.findByRole("alert")).textContent).toContain("at least one digit");
  });

  it("says when the session is gone or the service is unreachable", async () => {
    auth.email = null;
    wrap();
    fill("old-password", "new-password");
    expect((await screen.findByRole("alert")).textContent).toContain("session has ended");
    cleanup();
    auth.email = "a@example.com";
    auth.throwOnGetUser = true;
    wrap();
    fill("old-password", "new-password");
    expect((await screen.findByRole("alert")).textContent).toContain("could not be reached");
  });
});
