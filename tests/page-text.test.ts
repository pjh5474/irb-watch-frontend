import { describe, expect, it } from "vitest";
import { formatPageText } from "../src/lib/page-text";

describe("formatPageText", () => {
  it("breaks after the first date and before ' - ' and ' @ ' items", () => {
    const raw = "임상연구윤리센터 2026-09-03 [공문] 안내 - 시행일: 2024년 8월 6일 @ 식약처 공문 발췌";
    expect(formatPageText(raw)).toBe(
      "임상연구윤리센터 2026-09-03\n[공문] 안내\n- 시행일: 2024년 8월 6일\n@ 식약처 공문 발췌",
    );
  });

  it("only touches the first date, and only near the start", () => {
    const raw = "Title with no date up front but a date later 2026-09-03 and 2026-10-01 in text";
    expect(formatPageText(raw)).toBe(raw);
  });

  it("does not add a second break after an existing newline", () => {
    expect(formatPageText("a\n- b")).toBe("a\n- b");
  });

  it("leaves text without separators alone", () => {
    expect(formatPageText("plain text")).toBe("plain text");
  });

  it("gives both sides of a diff the same treatment", () => {
    const a = formatPageText("X 2026-01-01 T - one");
    const b = formatPageText("X 2026-01-01 T - two");
    expect(a.split("\n").slice(0, 2)).toEqual(b.split("\n").slice(0, 2));
  });
});
