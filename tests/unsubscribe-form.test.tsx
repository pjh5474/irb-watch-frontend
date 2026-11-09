import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { UnsubscribeForm } from "../src/components/unsubscribe-form";

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

const net = {
  calls: [] as Array<[string, string | undefined]>,
  answer: (async () => new Response("{}", { status: 200 })) as () => Promise<Response>,
};

function show(token: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <UnsubscribeForm token={token} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  net.calls.length = 0;
  net.answer = async () => new Response("{}", { status: 200 });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    net.calls.push([url, init?.method]);
    return net.answer();
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("UnsubscribeForm", () => {
  it("opening the page changes nothing: no request is sent until the button is pressed", () => {
    show("tok.en");
    expect(screen.getByText(/Stop the daily digest email/)).toBeTruthy();
    expect(net.calls).toEqual([]);
  });

  it("the button sends the token with POST and confirms", async () => {
    show("a-b.c d");
    fireEvent.click(screen.getByRole("button", { name: "Stop the emails" }));
    expect(await screen.findByText(/You will not get the daily digest any more/)).toBeTruthy();
    expect(net.calls).toEqual([["https://api.test/unsubscribe?token=a-b.c%20d", "POST"]]); // encoded
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("a missing token is shown as an invalid link and sends nothing", () => {
    show(null);
    expect(screen.getByText(/This link is not valid/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(net.calls).toEqual([]);
  });

  it("the server refusing the token (400) says the link is not valid", async () => {
    net.answer = async () => new Response("{}", { status: 400 });
    show("bad.token");
    fireEvent.click(screen.getByRole("button", { name: "Stop the emails" }));
    expect(await screen.findByText(/This link is not valid/)).toBeTruthy();
  });

  it("a server error or no answer offers to try again and never claims success", async () => {
    net.answer = async () => new Response("{}", { status: 500 });
    show("tok.en");
    fireEvent.click(screen.getByRole("button", { name: "Stop the emails" }));
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
    expect(screen.queryByText(/You will not get/)).toBeNull();

    net.answer = async () => {
      throw new TypeError("Failed to fetch");
    };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop the emails" }));
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
  });
});
