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
  updateFails: new Set<number>(),
  createError: null as unknown,
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
      scanSelected: async (ids: number[]) => {
        api.calls.push(`scanSelected ${ids.join(",")}`);
        return { status: "started", count: ids.length };
      },
      updateSource: async (id: number, body: unknown) => {
        api.calls.push(`update ${id} ${JSON.stringify(body)}`);
        if (api.updateFails.has(id)) throw new ApiError(403, "not allowed for this source");
        return {};
      },
      createSource: async (body: { name: string }) => {
        api.calls.push(`createSource ${body.name}`);
        if (api.createError) throw api.createError;
        return {};
      },
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
  api.updateFails = new Set();
  api.createError = null;
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
    await screen.findByRole("link", { name: "Public board" });
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

const RBAY = (id: number, name: string, board: string, code = "b1ZKS1VGblAvTU1hMU5Rb0xWcUp4UT09") => ({
  ...base,
  id,
  name,
  adapter: "rbay",
  url: `https://www.r-bay.co.kr/agency/main/${code}?board=${board}`,
  login_user: "owner",
  requires_login: true,
});

describe("grouped by hospital or site", () => {
  it("puts each R-BAY hospital's boards together under the name they share", async () => {
    api.sources = [RBAY(11,"이화목동 관련규정", "REGLA"), RBAY(12,"이화목동 공지", "NOTI"), RBAY(13,"대구가톨릭 공지", "NOTI", "emNyaVJpcTBZT0RnUmVvL2d6Qlordz09"), PUBLIC];
    show();
    const ewha = await screen.findByRole("button", { name: /이화목동 · R-BAY · 2 sources/ });
    expect(ewha.getAttribute("aria-expanded")).toBe("true"); // a small setup starts open
    expect(screen.getByRole("link", { name: "이화목동 관련규정" })).toBeTruthy();
    fireEvent.click(ewha);
    expect(screen.queryByRole("link", { name: "이화목동 관련규정" })).toBeNull();
    expect(screen.getByRole("link", { name: "대구가톨릭 공지" })).toBeTruthy(); // other groups stay open
  });

  it("pages by group: 20 groups a page", async () => {
    api.sources = Array.from({ length: 23 }, (_, i) => ({
      ...PUBLIC,
      id: i + 1,
      name: `Board ${i + 1}`,
      url: `https://site${String(i + 1).padStart(2, "0")}.example.org/list?key=1`,
    }));
    show();
    await screen.findByText(/23 of 23 sources in 23 groups/);
    const groupButtons = () => screen.getAllByRole("button", { name: /· site\d+\.example\.org/ });
    expect(groupButtons()).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(groupButtons()).toHaveLength(3);
  });

  it("the attention banner counts every source and its link filters to them", async () => {
    const broken = { ...PUBLIC, id: 99, name: "Broken board", url: "https://other.example.org/x", last_scan_status: "failed", last_scan_error: "x", last_scan_at: "2026-11-09T00:00:00+00:00" };
    api.sources = [PUBLIC, broken];
    show();
    expect(await screen.findByText(/1 source\(s\) need attention/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.queryByRole("link", { name: "Public board" })).toBeNull();
    expect(screen.getByRole("link", { name: "Broken board" })).toBeTruthy();
  });

  it("search finds sources by name, hospital or address", async () => {
    api.sources = [RBAY(11,"이화목동 관련규정", "REGLA"), RBAY(12,"이화목동 공지", "NOTI"), PUBLIC];
    show();
    await screen.findByRole("link", { name: "Public board" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "공지" } });
    expect(screen.getByRole("link", { name: "이화목동 공지" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "이화목동 관련규정" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Public board" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nothing like this" } });
    expect(screen.getByText("No source matches these filters.")).toBeTruthy();
  });
});

describe("bulk actions", () => {
  it("scans the selected sources together (the server queues them per site)", async () => {
    api.sources = [RBAY(11,"이화목동 관련규정", "REGLA"), RBAY(12,"이화목동 공지", "NOTI"), PUBLIC];
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select every source of 이화목동" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan selected" }));
    expect(await screen.findByText(/Scan started for 2 sources/)).toBeTruthy();
    expect(api.calls).toContain("scanSelected 11,12");
  });

  it("switches AI off for each selected source and reports any failure with its reason", async () => {
    api.sources = [PUBLIC, { ...PUBLIC, id: 2, name: "Second board", url: "https://hrpp.snuh.org/hrpp/bbs/list.do?key=2" }];
    api.updateFails = new Set([2]);
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Public board" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Second board" }));
    fireEvent.click(screen.getByRole("button", { name: "AI off" }));
    expect(await screen.findByText(/AI off: done for 1, failed for 1: Second board: .*not allowed/)).toBeTruthy();
    expect(api.calls.filter((c) => c.startsWith("update"))).toEqual(['update 1 {"ai_enabled":false}', 'update 2 {"ai_enabled":false}']);
  });
});

describe("add-source dialog", () => {
  it("opens from the button, adds the source and closes", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Add a source" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New board" } });
    fireEvent.change(screen.getByLabelText(/Board address/), { target: { value: "https://hrpp.snuh.org/hrpp/bbs/list.do?key=1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    expect(await screen.findByText('Source "New board" added.')).toBeTruthy();
    expect(dialog.isConnected).toBe(false);
    expect(api.calls).toContain("createSource New board");
  });

  it("keeps the dialog open with the server's reason when adding fails, and Escape closes it", async () => {
    api.createError = new ApiError(422, "add ?board=<code> to the R-BAY address");
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Add a source" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/Board address/), { target: { value: "https://www.r-bay.co.kr/agency/main/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    expect(await screen.findByText(/add \?board=<code>/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
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
