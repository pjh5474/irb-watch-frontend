import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageHref, pageItems, pageRange, parsePage } from "../src/lib/paging";

describe("parsePage", () => {
  it("reads a positive whole number and treats anything else as page 1", () => {
    expect(parsePage("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc", "2x", " 2", "99999999"]) {
      expect(parsePage(bad)).toBe(1);
    }
  });
});

describe("page maths", () => {
  it("counts pages, with at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(95)).toBe(10);
  });

  it("clamps a stale page to the last one", () => {
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
  });

  it("gives the database range of a page", () => {
    expect(pageRange(1)).toEqual([0, 9]);
    expect(pageRange(3)).toEqual([20, 29]);
    expect(pageRange(2, 50)).toEqual([50, 99]);
  });
});

describe("pageItems", () => {
  it("shows every page when there are few", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves a gap marker where pages are skipped", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageItems(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("writes out a single skipped page instead of a gap", () => {
    expect(pageItems(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageItems(5, 9)).toEqual([1, "gap", 4, 5, 6, "gap", 9]);
  });

  it("always includes the current page", () => {
    for (let pages = 1; pages <= 30; pages++) {
      for (let page = 1; page <= pages; page++) expect(pageItems(page, pages)).toContain(page);
    }
  });
});

describe("pageHref", () => {
  it("leaves the page out for page 1 and keeps the other parameters", () => {
    expect(pageHref("/", {}, "cp", 1)).toBe("/");
    expect(pageHref("/", { source: "5" }, "cp", 1)).toBe("/?source=5");
    expect(pageHref("/", { source: "5", rp: "2" }, "cp", 3)).toBe("/?source=5&rp=2&cp=3");
  });

  it("drops empty values", () => {
    expect(pageHref("/sources/5", { new: undefined }, "page", 2)).toBe("/sources/5?page=2");
    expect(pageHref("/sources/5", { new: "1" }, "page", 2)).toBe("/sources/5?new=1&page=2");
  });
});
