import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useFormatter } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));

afterEach(cleanup);

function Shown({ iso }: { iso: string }) {
  const format = useFormatter();
  return <span>{format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", hour12: false })}</span>;
}

describe("time zone", () => {
  it("the request config sets Korean time for every page", async () => {
    const { default: config, TIME_ZONE } = await import("../src/i18n/request");
    const result = await (config as unknown as (p: { requestLocale: Promise<string> }) => Promise<{ timeZone: string }>)({
      requestLocale: Promise.resolve("ko"),
    });
    expect(TIME_ZONE).toBe("Asia/Seoul");
    expect(result.timeZone).toBe("Asia/Seoul");
  });

  it("a scan at 05:00 UTC shows as 14:00", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
        <Shown iso="2026-11-10T05:00:00+00:00" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("14:00")).toBeTruthy();
  });
});
