import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "../src/components/markdown-text";

const html = (md: string) => renderToStaticMarkup(<MarkdownText>{md}</MarkdownText>);

describe("MarkdownText", () => {
  it("renders bullets and bold", () => {
    const out = html("- **Purpose:** consent form\n- **Who:** coordinators");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>");
    expect(out).toContain("<strong");
    expect(out).toContain("consent form");
  });

  it("plain old summaries still render as text", () => {
    expect(html("A plain sentence from before.")).toContain("A plain sentence from before.");
  });

  it("drops links but keeps their text", () => {
    const out = html("[click here](https://evil.example/login) now");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("evil.example");
    expect(out).toContain("click here");
  });

  it("drops images, so no image URL can be requested", () => {
    const out = html("![x](https://evil.example/pixel.png?d=secret)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("evil.example");
  });

  it("never renders raw HTML as elements: it is shown as harmless escaped text", () => {
    const out = html('<script>alert(1)</script><b onclick="x()">hi</b>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<b ");
    expect(out).toContain("&lt;script&gt;"); // visible text, not an element
  });

  it("short mode flattens headings and tables to plain text", () => {
    const out = html("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).not.toContain("<h");
    expect(out).not.toContain("<table");
  });
});

const rich = (md: string) => renderToStaticMarkup(<MarkdownText rich>{md}</MarkdownText>);

describe("MarkdownText rich (README style)", () => {
  const md = "## Purpose\n\n- **Who:** coordinators\n\n## Dates\n\n| Item | Date |\n|---|---|\n| Revised | 2024-12-19 |\n\n> note";

  it("renders headings, bullets, a table and a quote", () => {
    const out = rich(md);
    expect(out).toContain("<h3");
    expect(out).toContain("Purpose");
    expect(out).toContain("<ul");
    expect(out).toContain("<table");
    expect(out).toContain("<th");
    expect(out).toContain("2024-12-19");
    expect(out).toContain("<blockquote");
  });

  it("does not leak the node prop into the page", () => {
    expect(rich(md)).not.toContain("node=");
  });

  it("still drops links, images and raw HTML", () => {
    const out = rich("[a](https://evil.example) ![i](https://evil.example/p.png) <script>x</script>");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("evil.example");
  });

  it("a malformed table stays readable text instead of breaking the page", () => {
    const out = rich("| a | b\n| 1");
    expect(out).toContain("a");
    expect(out).not.toContain("<script");
  });
});
