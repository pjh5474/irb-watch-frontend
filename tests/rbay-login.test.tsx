import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { RbayLoginCard } from "../src/components/rbay-login";
import type { RbayLogin } from "../src/lib/api/rbay-login";

const api = vi.hoisted(() => ({
  state: null as unknown as RbayLogin,
  sent: [] as Array<[string, string]>,
  gets: 0,
  testing: 0, // how many GETs still answer "testing" after a save or a test
  saveError: null as null | { status: number; message: string },
  testCalls: 0,
  removed: 0,
}));

const none: RbayLogin = {
  has_login: false, login_hint: null, status: "untested", last_error: null, last_tested_at: null, last_ok_at: null,
};

vi.mock("@/lib/api/rbay-login", async () => {
  const { ApiError } = await import("../src/lib/api/client");
  const get = async () => {
    api.gets += 1;
    if (api.state.status === "testing" && api.testing > 0) {
      api.testing -= 1;
      if (api.testing === 0) api.state = { ...api.state, status: "ok", last_tested_at: "2026-11-20T09:00:00Z" };
    }
    return api.state;
  };
  return {
    MAX_RBAY_FIELD: 200,
    rbayLoginApi: {
      get,
      save: async (id: string, password: string) => {
        api.sent.push([id, password]);
        if (api.saveError) throw new ApiError(api.saveError.status, api.saveError.message);
        api.state = { ...none, has_login: true, login_hint: id.slice(0, 2) + "***", status: "testing" };
        return api.state;
      },
      test: async () => {
        api.testCalls += 1;
        if (api.saveError) throw new ApiError(api.saveError.status, api.saveError.message);
        api.state = { ...api.state, status: "testing" };
        return api.state;
      },
      remove: async () => {
        api.removed += 1;
        api.state = none;
      },
    },
    waitForTest: async (first: RbayLogin) => {
      let current = first;
      while (current.status === "testing") current = await get();
      return current;
    },
  };
});

function show(locale: "en" | "ko" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ko}>
      <RbayLoginCard />
    </NextIntlClientProvider>,
  );
}

function type(id: string, password: string) {
  fireEvent.change(screen.getByLabelText("R-BAY ID"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("R-BAY password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
}

beforeEach(() => {
  api.state = none;
  api.sent = [];
  api.gets = 0;
  api.testing = 0;
  api.saveError = null;
  api.testCalls = 0;
  api.removed = 0;
});
afterEach(cleanup);

describe("My R-BAY login card", () => {
  it("shows the form when nothing is saved", async () => {
    show();
    expect(await screen.findByLabelText("R-BAY ID")).toBeTruthy();
    expect(screen.getByText(/after 3 refusals in a row/)).toBeTruthy();
  });

  it("sends the login once, clears the password at once, and follows the test to 'works'", async () => {
    api.testing = 2;
    show();
    await screen.findByLabelText("R-BAY ID");
    type("abc@x.kr", "secret-pw-1");
    expect(api.sent).toEqual([["abc@x.kr", "secret-pw-1"]]);
    await waitFor(() => expect(screen.getByTestId("rbay-status").textContent).toContain("works"));
    expect(screen.getByTestId("rbay-status").textContent).toContain("ab***");
    // neither the password nor the ID is anywhere on the page
    expect(document.body.innerHTML).not.toContain("secret-pw-1");
    expect(document.body.innerHTML).not.toContain("abc@x.kr");
  });

  it("clears the typed password even when the server refuses", async () => {
    api.saveError = { status: 429, message: "wait about 10 minute(s) before the next test" };
    show();
    await screen.findByLabelText("R-BAY ID");
    type("abc", "secret-pw-2");
    expect((await screen.findByRole("alert")).textContent).toContain("wait about 10 minute(s)");
    expect((screen.getByLabelText("R-BAY password") as HTMLInputElement).value).toBe("");
    expect(document.body.innerHTML).not.toContain("secret-pw-2");
  });

  it("asks for both fields before sending anything", async () => {
    show();
    await screen.findByLabelText("R-BAY ID");
    type("abc", "");
    expect((await screen.findByRole("alert")).textContent).toContain("both");
    expect(api.sent).toEqual([]);
  });

  it("a refused password shows R-BAY's reason and cannot be tested again", async () => {
    api.state = { ...none, has_login: true, login_hint: "ab***", status: "rejected", last_error: "R-BAY login rejected: 불일치" };
    show();
    expect(await screen.findByText("R-BAY refused the password")).toBeTruthy();
    expect(screen.getByText("R-BAY login rejected: 불일치")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Test again" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a failed test says it is not the password's fault and allows testing again", async () => {
    api.state = { ...none, has_login: true, login_hint: "ab***", status: "failed", last_error: "R-BAY did not finish the login" };
    show();
    expect(await screen.findByText(/not a wrong password/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Test again" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("follows a test that was already running when the page opened", async () => {
    api.state = { ...none, has_login: true, login_hint: "ab***", status: "testing" };
    api.testing = 1;
    show();
    await waitFor(() => expect(screen.getByTestId("rbay-status").textContent).toContain("works"));
  });

  it("deleting asks first, then deletes", async () => {
    api.state = { ...none, has_login: true, login_hint: "ab***", status: "ok", last_tested_at: "2026-11-20T09:00:00Z" };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Delete login" }));
    expect(api.removed).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));
    await waitFor(() => expect(api.removed).toBe(1));
    expect(await screen.findByText("Your R-BAY login is deleted.")).toBeTruthy();
    expect(await screen.findByLabelText("R-BAY ID")).toBeTruthy();
  });

  it("test again calls the server once and follows it", async () => {
    api.state = { ...none, has_login: true, login_hint: "ab***", status: "ok", last_tested_at: "2026-11-20T09:00:00Z" };
    api.testing = 1;
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Test again" }));
    await waitFor(() => expect(api.testCalls).toBe(1));
    await waitFor(() => expect(screen.getByTestId("rbay-status").textContent).toContain("works"));
  });

  it("is available in Korean", async () => {
    show("ko");
    expect(await screen.findByLabelText("R-BAY 아이디")).toBeTruthy();
  });
});

describe("messages", () => {
  const keys = (o: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  it("has the same rbay keys in English and Korean", () => {
    const pick = (m: typeof en) => keys(m.settings as Record<string, unknown>).filter((k) => k.startsWith("rbay")).sort();
    expect(pick(ko as typeof en)).toEqual(pick(en));
    expect(pick(en).length).toBeGreaterThan(20);
  });
});
