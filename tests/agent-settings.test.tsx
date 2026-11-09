import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { AgentSettings, parseLimit } from "../src/components/admin/agent-settings";
import { ApiError } from "../src/lib/api/client";

const api = vi.hoisted(() => ({
  limits: { user_daily_limit: 30, admin_daily_limit: 100 },
  saved: [] as unknown[],
  saveError: null as unknown,
  loadError: null as unknown,
}));

vi.mock("@/lib/api/agent", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/agent")>("../src/lib/api/agent");
  return {
    ...actual,
    agentApi: {
      limits: async () => {
        if (api.loadError) throw api.loadError;
        return { ...api.limits };
      },
      saveLimits: async (body: typeof api.limits) => {
        api.saved.push(body);
        if (api.saveError) throw api.saveError;
        api.limits = body;
        return body;
      },
    },
  };
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <AgentSettings />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const userField = () => screen.getByLabelText("Users") as HTMLInputElement;
const adminField = () => screen.getByLabelText("Admins") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Save limits" }) as HTMLButtonElement;

beforeEach(() => {
  api.limits = { user_daily_limit: 30, admin_daily_limit: 100 };
  api.saved = [];
  api.saveError = null;
  api.loadError = null;
});
afterEach(cleanup);

describe("parseLimit", () => {
  it("accepts whole numbers from 0 to 1000 only", () => {
    expect(parseLimit("0")).toBe(0);
    expect(parseLimit(" 30 ")).toBe(30);
    expect(parseLimit("1000")).toBe(1000);
    for (const bad of ["", "1001", "-1", "1.5", "abc", "1e3", "12345"]) expect(parseLimit(bad)).toBeNull();
  });
});

describe("assistant limits", () => {
  it("shows the saved limits and keeps Save off until something changes", async () => {
    show();
    await waitFor(() => expect(userField().value).toBe("30"));
    expect(adminField().value).toBe("100");
    expect(saveButton().disabled).toBe(true);
  });

  it("saves both numbers once and shows the new values", async () => {
    show();
    await waitFor(() => expect(userField().value).toBe("30"));
    fireEvent.change(userField(), { target: { value: "12" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect(await screen.findByText("Limits saved.")).toBeTruthy();
    expect(api.saved).toEqual([{ user_daily_limit: 12, admin_daily_limit: 100 }]);
    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(userField().value).toBe("12");
  });

  it("refuses a number the server would refuse, and says why", async () => {
    show();
    await waitFor(() => expect(userField().value).toBe("30"));
    fireEvent.change(adminField(), { target: { value: "5000" } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText("Each limit must be a whole number from 0 to 1000.")).toBeTruthy();
    expect(adminField().getAttribute("aria-invalid")).toBe("true");
  });

  it("0 is allowed (it switches the assistant off for that type)", async () => {
    show();
    await waitFor(() => expect(userField().value).toBe("30"));
    fireEvent.change(userField(), { target: { value: "0" } });
    fireEvent.click(saveButton());
    await screen.findByText("Limits saved.");
    expect(api.saved).toEqual([{ user_daily_limit: 0, admin_daily_limit: 100 }]);
  });

  it("shows the server's reason when saving fails and keeps what was typed", async () => {
    api.saveError = new ApiError(422, "the user limit must be between 0 and 1000");
    show();
    await waitFor(() => expect(userField().value).toBe("30"));
    fireEvent.change(userField(), { target: { value: "7" } });
    fireEvent.click(saveButton());
    expect(await screen.findByText("the user limit must be between 0 and 1000")).toBeTruthy();
    expect(userField().value).toBe("7");
  });

  it("shows the reason when the limits cannot be loaded, and offers no form", async () => {
    api.loadError = new ApiError(0, "cannot reach the server");
    show();
    expect(await screen.findByText("Cannot reach the server. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save limits" })).toBeNull();
  });
});
