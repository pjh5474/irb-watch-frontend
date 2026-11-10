import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { FeedFilterBar } from "../src/components/feed-filters";
import { allowedSources, filterParams, NO_FILTERS, parseFeedFilters, since } from "../src/lib/feed-filters";
import { commonLabel, groupBySite, siteOf } from "../src/lib/site-groups";

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: (href: string) => nav.pushed.push(href) }),
}));

beforeEach(() => {
  nav.pushed.length = 0;
});
afterEach(cleanup);

describe("feed filters in the address", () => {
  it("reads known values and drops the rest", () => {
    const f = parseFeedFilters({ src: "3,1,x,3", pr: "high,urgent", type: "new,bogus", days: "30", project: "7" });
    expect(f).toEqual({ sources: [3, 1], priorities: ["high"], types: ["new"], days: 30, project: 7 });
    expect(parseFeedFilters({ days: "5" }).days).toBeNull(); // only 7, 30 or 90
  });

  it("keeps the older single ?source= links working", () => {
    expect(parseFeedFilters({ source: "4" }).sources).toEqual([4]);
  });

  it("writes only the filters that are set", () => {
    expect(filterParams({ ...NO_FILTERS, priorities: ["high", "low"] })).toEqual({
      src: undefined,
      pr: "high,low",
      type: undefined,
      days: undefined,
      project: undefined,
    });
  });

  it("a project narrows the sources; an empty overlap means nothing can match", () => {
    expect(allowedSources(NO_FILTERS, null)).toBeNull();
    expect(allowedSources({ ...NO_FILTERS, project: 1 }, [2, 3])).toEqual([2, 3]);
    expect(allowedSources({ ...NO_FILTERS, sources: [1, 3], project: 1 }, [2, 3])).toEqual([3]);
    expect(allowedSources({ ...NO_FILTERS, sources: [1], project: 1 }, [2])).toEqual([]);
  });

  it("a period is counted back from now", () => {
    expect(since(null)).toBeNull();
    expect(since(7, Date.UTC(2026, 10, 10))).toBe("2026-11-03T00:00:00.000Z");
  });
});

describe("hospital groups", () => {
  it("one group per R-BAY hospital, one per other host", () => {
    expect(siteOf("https://www.r-bay.co.kr/agency/main/ABC123?board=NOTI").key).toBe("rbay:ABC123");
    expect(siteOf("https://hrpp.snuh.org/hrpp/bbs/list.do?key=1").key).toBe("hrpp.snuh.org");
  });

  it("labels a group with the whole words its names share", () => {
    expect(commonLabel(["이화목동 관련규정", "이화목동 공지", "이화목동 양식함"])).toBe("이화목동");
    expect(commonLabel(["서울대 IRB 공지", "서울대 IRB 양식"])).toBe("서울대 IRB");
    expect(commonLabel(["Board 1", "Board 12"])).toBe("Board"); // never half a word
    expect(commonLabel(["A", "B"])).toBe("");
  });

  it("falls back to the source's own name or the site", () => {
    const groups = groupBySite([
      { name: "대구가톨릭 공지", url: "https://www.r-bay.co.kr/agency/main/D1?board=NOTI" },
      { name: "x", url: "https://www.r-bay.co.kr/agency/main/E1?board=NOTI" },
      { name: "y", url: "https://www.r-bay.co.kr/agency/main/E1?board=REGLA" },
    ]);
    // Korean sort order: Hangul before Latin.
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["대구가톨릭 공지", 1],
      ["R-BAY E1…", 2],
    ]);
  });
});

describe("filter bar", () => {
  const sources = [
    { id: 1, name: "이화목동 공지" },
    { id: 2, name: "이화목동 양식함" },
    { id: 3, name: "SNUH board" },
  ];

  function show(current = NO_FILTERS) {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FeedFilterBar sources={sources} projects={[{ id: 9, name: "My study" }]} current={current} />
      </NextIntlClientProvider>,
    );
  }

  it("finds sources by typing, then applies every filter to the address", () => {
    show();
    fireEvent.change(screen.getByLabelText("Sources"), { target: { value: "이화" } });
    expect(screen.getAllByRole("button", { name: /이화목동/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "이화목동 공지" }));
    fireEvent.click(screen.getByLabelText("High"));
    fireEvent.click(screen.getByLabelText("New document"));
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(nav.pushed).toEqual(["/?src=1&pr=high&type=new&days=30&project=9"]);
  });

  it("removes a chosen source and clears every filter", () => {
    show({ ...NO_FILTERS, sources: [3], priorities: ["low"] });
    fireEvent.click(screen.getByRole("button", { name: "Remove SNUH board" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(nav.pushed).toEqual(["/?pr=low"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(nav.pushed[1]).toBe("/");
  });

  it("says so when no source has that name", () => {
    show();
    fireEvent.change(screen.getByLabelText("Sources"), { target: { value: "nothing" } });
    expect(screen.getByText("No source with that name.")).toBeTruthy();
  });
});
