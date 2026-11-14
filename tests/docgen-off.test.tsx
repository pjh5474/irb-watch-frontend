import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";
import { AdminTabs } from "../src/components/admin/admin-tabs";
import { DocgenGate } from "../src/components/drafts/docgen-off";
import { docgenEnabled } from "../src/lib/features";

// The docs generator's screens are hidden unless NEXT_PUBLIC_DOCGEN_ENABLED is "true" (owner,
// 2026-11-14). vitest.config.ts switches it on for the other tests.

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => "/admin/sources",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) =>
    (en as unknown as Record<string, Record<string, string>>)[ns][key],
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function tabs() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul">
      <AdminTabs />
    </NextIntlClientProvider>,
  );
}

describe("docs generator switch", () => {
  it("is on only for the exact value true", () => {
    for (const value of ["", "false", "1", "TRUE", "yes"]) {
      vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", value);
      expect(docgenEnabled()).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "true");
    expect(docgenEnabled()).toBe(true);
  });

  it("is off when the variable is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", undefined);
    expect(docgenEnabled()).toBe(false);
  });

  it("hides the Guides and Forms admin tabs when off, keeps the rest", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "false");
    tabs();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/admin/guides");
    expect(hrefs).not.toContain("/admin/templates");
    expect(hrefs).toContain("/admin/pipeline");
    expect(hrefs).toContain("/admin/ai");
    expect(hrefs).toContain("/admin/assistant");
  });

  it("shows the Guides and Forms admin tabs when on", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "true");
    tabs();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/guides");
    expect(hrefs).toContain("/admin/templates");
  });

  it("an old draft, guide or form link shows why the page is gone instead of the page", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "false");
    render(await DocgenGate({ children: <p>the draft editor</p> }));
    expect(screen.getByRole("status").textContent).toBe(en.drafts.off);
    expect(screen.queryByText("the draft editor")).toBeNull();
  });

  it("shows the page itself when on", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOCGEN_ENABLED", "true");
    render(await DocgenGate({ children: <p>the draft editor</p> }));
    expect(screen.getByText("the draft editor")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("has the notice in both languages", () => {
    expect(en.drafts.off.length).toBeGreaterThan(0);
    expect(ko.drafts.off.length).toBeGreaterThan(0);
  });
});
