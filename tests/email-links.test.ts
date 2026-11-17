import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAIL_COMPOSE_URL, copyText, emailParts, mailComposeUrl } from "../src/lib/email-links";

describe("mailComposeUrl and copyText", () => {
  it("opens Hiworks' new-mail page by default", () => {
    expect(mailComposeUrl()).toBe(DEFAULT_MAIL_COMPOSE_URL);
  });

  it("takes an https address from the setting and ignores anything else", () => {
    vi.stubEnv("NEXT_PUBLIC_MAIL_COMPOSE_URL", "https://mail.example.com/new");
    expect(mailComposeUrl()).toBe("https://mail.example.com/new");
    vi.stubEnv("NEXT_PUBLIC_MAIL_COMPOSE_URL", "javascript:alert(1)");
    expect(mailComposeUrl()).toBe(DEFAULT_MAIL_COMPOSE_URL);
    vi.unstubAllEnvs();
  });

  it("copies to the clipboard, and says false when the browser refuses", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("a@x.kr")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("a@x.kr");
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    expect(await copyText("a@x.kr")).toBe(false);
    vi.unstubAllGlobals();
  });
});

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

  it("never puts a query, quote or markup into an address", () => {
    const parts = emailParts("a@x.kr?cc=evil@z.com&subject=hi <b>x</b>");
    const addresses = parts.filter((p) => p.kind === "email").map((p) => p.text);
    expect(addresses).toEqual(["a@x.kr", "evil@z.com"]);
    expect(addresses.some((a) => /[?&<>"\s]/.test(a))).toBe(false);
  });

  it("gives back the whole text when the parts are joined", () => {
    const text = "x a@x.kr y\nb@y.kr";
    expect(emailParts(text).map((p) => p.text).join("")).toBe(text);
  });
});
