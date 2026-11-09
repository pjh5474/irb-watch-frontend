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
  sources: [] as unknown[],
  logins: [] as unknown[],
  loginsError: null as unknown,
  testMail: async (): Promise<unknown> => ({ status: "sent" }),
  weekly: async (): Promise<unknown> => ({ status: "sent" }),
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
      sources: async () => api.sources,
      logins: async () => {
        api.calls.push("logins");
        if (api.loginsError) throw api.loginsError;
        return api.logins;
      },
      scanAll: async () => ({ status: "started" }),
      scanSource: async () => ({ status: "started" }),
      createSource: async () => ({}),
      sendTestMail: async () => {
        api.calls.push("sendTestMail");
        return api.testMail();
      },
      sendWeeklyPreview: async () => {
        api.calls.push("sendWeeklyPreview");
        return api.weekly();
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

const base = {
  adapter: "snuh_hrpp",
  needs_browser: false,
  is_active: true,
  created_at: "2026-11-09T00:00:00+00:00",
  last_scan_at: null,
  last_scan_status: null,
  last_scan_error: null,
  scan_in_progress: false,
  scans_paused_reason: null,
  ai_enabled: true,
};
const PUBLIC = { ...base, id: 1, name: "Public board", url: "https://hrpp.snuh.org/hrpp/bbs/list.do?key=1111111111", login_user: null, requires_login: false };
const STUDY = { ...base, id: 5, name: "Study 1", url: "https://hrpp.snuh.org/hrpp/bbs/list.do?key=2605277031", login_user: "study-1", requires_login: true, ai_enabled: false };

beforeEach(() => {
  api.sources = [];
  api.logins = [];
  api.loginsError = null;
  api.calls.length = 0;
  api.testMail = async () => ({ status: "sent" });
  api.weekly = async () => ({ status: "sent" });
});
afterEach(cleanup);

describe("stored login sign", () => {
  it("shows a green sign for a study whose login is stored", async () => {
    api.sources = [STUDY];
    api.logins = [{ owner_label: "study-1", site: "snuh-2605277031", updated_at: "2026-11-09T01:00:00+00:00" }];
    show();
    expect(await screen.findByText("Login saved")).toBeTruthy();
    expect(screen.queryByText("No login saved")).toBeNull();
  });

  it("shows a warning sign for a study with no stored login", async () => {
    api.sources = [STUDY];
    show();
    expect(await screen.findByText("No login saved")).toBeTruthy();
    expect(screen.queryByText("Login saved")).toBeNull();
  });

  it("does not count a login stored for another label or another board", async () => {
    api.sources = [STUDY];
    api.logins = [
      { owner_label: "study-2", site: "snuh-2605277031", updated_at: null },
      { owner_label: "study-1", site: "snuh-9999999999", updated_at: null },
    ];
    show();
    expect(await screen.findByText("No login saved")).toBeTruthy();
  });

  it("shows no login sign for a public source and does not even ask for the logins", async () => {
    api.sources = [PUBLIC];
    show();
    await screen.findByText("Public board");
    expect(screen.queryByText("Login saved")).toBeNull();
    expect(screen.queryByText("No login saved")).toBeNull();
    expect(screen.queryByText("Login status unknown")).toBeNull();
    expect(api.calls).not.toContain("logins");
  });

  it("says the status is unknown, never 'saved', when the logins cannot be read", async () => {
    api.sources = [STUDY];
    api.loginsError = new ApiError(409, "managing credentials over the API needs CREDENTIAL_STORE=database on this server");
    show();
    expect(await screen.findByText("Login status unknown")).toBeTruthy();
    expect(screen.queryByText("Login saved")).toBeNull();
    expect(screen.queryByText("No login saved")).toBeNull();
  });

  it("asks for the logins once for the whole list", async () => {
    api.sources = [STUDY, { ...STUDY, id: 6, name: "Study 2", login_user: "study-2" }];
    show();
    await screen.findAllByText("No login saved");
    expect(api.calls.filter((c) => c === "logins")).toHaveLength(1);
  });
});

describe("paging of the source list", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...PUBLIC, id: i + 1, name: `Board ${i + 1}`, url: `https://hrpp.snuh.org/hrpp/bbs/list.do?key=${1000 + i}` }));

  it("shows 10 sources a page and moves to the next with the pager", async () => {
    api.sources = many(23);
    show();
    await screen.findByText("Board 1");
    expect(screen.queryByText("Board 11")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Board \d+/ })).toHaveLength(10);

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Board 11")).toBeTruthy();
    expect(screen.queryByText("Board 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
    expect(await screen.findByText("Board 23")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Board \d+/ })).toHaveLength(3);
  });

  it("has no pager for 10 sources or fewer", async () => {
    api.sources = many(10);
    show();
    await screen.findByText("Board 10");
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("the attention banner still counts sources on other pages", async () => {
    const broken = { ...PUBLIC, id: 99, name: "Broken board", last_scan_status: "failed", last_scan_error: "x", last_scan_at: "2026-11-09T00:00:00+00:00" };
    api.sources = [...many(12), broken];
    show();
    await screen.findByText("Board 1");
    expect(screen.queryByText("Broken board")).toBeNull(); // on page 2
    expect(await screen.findByText(/1 source\(s\) need attention/)).toBeTruthy();
  });
});

describe("weekly report preview button", () => {
  it("sends one preview and says it went to the admin's own address only", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send weekly report preview" }));
    expect(await screen.findByText(/sent to your own address only/)).toBeTruthy();
    expect(api.calls).toEqual(["sendWeeklyPreview"]);
  });

  it("two clicks in the same instant send one preview", async () => {
    let finish: (v: unknown) => void = () => {};
    api.weekly = () => new Promise((resolve) => (finish = resolve));
    show();
    const button = await screen.findByRole("button", { name: "Send weekly report preview" });
    act(() => {
      button.click();
      button.click();
    });
    expect(api.calls).toHaveLength(1);
    await act(async () => finish({ status: "sent" }));
    expect(await screen.findByText(/sent to your own address only/)).toBeTruthy();
  });

  it("the test mail and the preview share one guard: only one runs at a time", async () => {
    let finish: (v: unknown) => void = () => {};
    api.weekly = () => new Promise((resolve) => (finish = resolve));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send weekly report preview" }));
    expect((screen.getByRole("button", { name: "Send test email" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ status: "sent" }));
    await screen.findByText(/sent to your own address only/);
    expect(api.calls).toEqual(["sendWeeklyPreview"]);
  });

  it("shows the server's reason when the preview cannot be sent", async () => {
    api.weekly = async () => {
      throw new ApiError(409, "email is not set up on this server (RESEND_API_KEY, MAIL_FROM, APP_URL)");
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send weekly report preview" }));
    expect(await screen.findByText(/RESEND_API_KEY/)).toBeTruthy();
  });

  it("shows the mail service's reason when it refuses the send", async () => {
    api.weekly = async () => {
      throw new ApiError(502, "the mail service refused the message (HTTP 403: domain is not verified)");
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Send weekly report preview" }));
    expect(await screen.findByText(/domain is not verified/)).toBeTruthy();
  });
});

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
