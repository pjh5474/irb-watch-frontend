import { describe, expect, it } from "vitest";
import { emailParts, mailtoHref } from "../src/lib/email-links";

describe("emailParts", () => {
  it("makes a plain address one link", () => {
    expect(emailParts("irb@x.kr")).toEqual([{ kind: "email", text: "irb@x.kr" }]);
  });

  it("keeps the text around addresses as text, several addresses in one field", () => {
    expect(emailParts("접수: a@x.kr / b.c@y.co.kr (평일 08:30)")).toEqual([
      { kind: "text", text: "접수: " },
      { kind: "email", text: "a@x.kr" },
      { kind: "text", text: " / " },
      { kind: "email", text: "b.c@y.co.kr" },
      { kind: "text", text: " (평일 08:30)" },
    ]);
  });

  it("links nothing in text without a real address", () => {
    for (const text of ["_", "DRB", "(평일 08:30 ~ 17:30)", "irb@", "@x.kr", "irb@x", "없음"]) {
      expect(emailParts(text).every((p) => p.kind === "text")).toBe(true);
    }
  });

  it("leaves trailing punctuation out of the address", () => {
    expect(emailParts("irb@x.kr.")).toEqual([
      { kind: "email", text: "irb@x.kr" },
      { kind: "text", text: "." },
    ]);
  });

  it("cannot carry a subject, a copy or markup into the link", () => {
    const parts = emailParts("a@x.kr?cc=evil@z.com&subject=hi <b>x</b>");
    const links = parts.filter((p) => p.kind === "email").map((p) => mailtoHref(p.text));
    expect(links).toEqual(["mailto:a@x.kr", "mailto:evil@z.com"]);
    expect(links.some((l) => /[?&<>"\s]/.test(l))).toBe(false);
  });

  it("gives back the whole text when the parts are joined", () => {
    const text = "x a@x.kr y\nb@y.kr";
    expect(emailParts(text).map((p) => p.text).join("")).toBe(text);
  });
});
