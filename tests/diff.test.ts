import { describe, expect, it } from "vitest";
import { MAX_DIFF_WORDS, wordDiff } from "@/lib/diff";

describe("wordDiff", () => {
  it("marks added and removed words", () => {
    const parts = wordDiff("the old rule", "the new rule")!;
    expect(parts.filter((p) => p.kind === "removed").map((p) => p.text.trim())).toEqual(["old"]);
    expect(parts.filter((p) => p.kind === "added").map((p) => p.text.trim())).toEqual(["new"]);
  });
  it("returns only same parts for identical text", () => {
    expect(wordDiff("a b c", "a b c")!.every((p) => p.kind === "same")).toBe(true);
  });
  it("refuses text over the word cap", () => {
    const big = "w ".repeat(MAX_DIFF_WORDS + 1);
    expect(wordDiff(big, "x")).toBeNull();
    expect(wordDiff("x", big)).toBeNull();
  });
});
