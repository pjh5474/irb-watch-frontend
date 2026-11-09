import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AdminSources } from "../src/components/admin/admin-sources";
import { ApiError } from "../src/lib/api/client";

// Plain functions instead of vi.fn(): vitest reports a rejected promise returned by a spy as an
// unhandled error even though the component handles it.
const api = vi.hoisted(() => ({
  calls: [] as string[],
  testMail: async (): Promise<unknown> => ({ status: "sent" }),
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
      sources: async () => [],
      scanAll: async () => ({ status: "started" }),
      scanSource: async () => ({ status: "started" }),
      createSource: async () => ({}),
      sendTestMail: async () => {
        api.calls.push("sendTestMail");
        return api.testMail();
      },
    },
  };
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <AdminSources />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.calls.length = 0;
  api.testMail = async () => ({ status: "sent" });
});
afterEach(cleanup);

describe("send test email button", () => {
  it("sends one test mail and says where to look for it", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send test email" }));
    expect(await screen.findByText(/Test email sent to your own address/)).toBeTruthy();
    expect(api.calls).toEqual(["sendTestMail"]);
  });

  it("two clicks in the same instant send one mail", async () => {
    let finish: (v: unknown) => void = () => {};
    api.testMail = () => new Promise((resolve) => (finish = resolve));
    show();
    const button = await screen.findByRole("button", { name: "Send test email" });
    act(() => {
      button.click();
      button.click();
    });
    expect(api.calls).toHaveLength(1);
    await act(async () => finish({ status: "sent" }));
    expect(await screen.findByText(/Test email sent/)).toBeTruthy();
  });

  it("shows the mail service's own reason when the send is refused", async () => {
    api.testMail = async () => {
      throw new ApiError(502, "the mail service refused the message (HTTP 403: domain is not verified)");
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send test email" }));
    expect(await screen.findByText(/domain is not verified/)).toBeTruthy();
  });

  it("shows the server's reason when mail is not set up", async () => {
    api.testMail = async () => {
      throw new ApiError(409, "email is not set up on this server (RESEND_API_KEY, MAIL_FROM, APP_URL)");
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send test email" }));
    expect(await screen.findByText(/RESEND_API_KEY/)).toBeTruthy();
  });

  it("an unreachable server gets the plain message", async () => {
    api.testMail = async () => {
      throw new ApiError(0, "cannot reach the server");
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send test email" }));
    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
  });
});
