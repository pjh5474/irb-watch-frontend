import { describe, expect, it } from "vitest";
import { containsPattern } from "../src/lib/like";

describe("containsPattern", () => {
  it("wraps a plain title and escapes LIKE wildcards", () => {
    expect(containsPattern("공지")).toBe("%공지%");
    expect(containsPattern("100%")).toBe("%100\\%%");
    expect(containsPattern("a_b")).toBe("%a\\_b%");
    expect(containsPattern("a\\b")).toBe("%a\\\\b%");
  });
});
