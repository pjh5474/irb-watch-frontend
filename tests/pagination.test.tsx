import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../messages/en.json";
import { Pagination } from "../src/components/pagination";

import { vi } from "vitest";

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

function show(props: React.ComponentProps<typeof Pagination>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Pagination {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("Pagination as links", () => {
  it("draws nothing for a single page", () => {
    const { container } = show({ page: 1, pages: 1 });
    expect(container.innerHTML).toBe("");
  });

  it("links Previous, Next and the numbers, keeping the other parameters", () => {
    show({ page: 2, pages: 5, pathname: "/", param: "cp", query: { source: "5", rp: "3" } });
    expect(screen.getByRole("link", { name: /Previous/ }).getAttribute("href")).toBe("/?source=5&rp=3");
    expect(screen.getByRole("link", { name: /Next/ }).getAttribute("href")).toBe("/?source=5&rp=3&cp=3");
    expect(screen.getByRole("link", { name: "Go to page 5" }).getAttribute("href")).toBe("/?source=5&rp=3&cp=5");
  });

  it("marks the current page and does not link it", () => {
    show({ page: 2, pages: 5, pathname: "/sources" });
    const current = screen.getByText("2");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.tagName).toBe("SPAN");
    expect(screen.getByLabelText("Page 2 of 5")).toBe(current);
  });

  it("has no Previous link on the first page and no Next link on the last", () => {
    show({ page: 1, pages: 3, pathname: "/sources" });
    expect(screen.queryByRole("link", { name: /Previous/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Next/ })).toBeTruthy();
    cleanup();
    show({ page: 3, pages: 3, pathname: "/sources" });
    expect(screen.queryByRole("link", { name: /Next/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Previous/ })).toBeTruthy();
  });

  it("shortens a long list with a gap", () => {
    show({ page: 1, pages: 20, pathname: "/sources" });
    expect(screen.getByRole("link", { name: "Go to page 20" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Go to page 10" })).toBeNull();
  });
});

describe("Pagination as buttons", () => {
  it("reports the chosen page", () => {
    const chosen: number[] = [];
    show({ page: 2, pages: 4, onPage: (p) => chosen.push(p) });
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: "Go to page 4" }));
    expect(chosen).toEqual([3, 1, 4]);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
