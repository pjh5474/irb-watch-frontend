import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";

// next-intl does not check keys at build time: a missing one shows up as an error on the page.

function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

function has(messages: Record<string, unknown>, path: string): boolean {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("both languages have the same messages", () => {
  it("Korean and English define exactly the same keys", () => {
    const e = new Set(keysOf(en));
    const k = new Set(keysOf(ko));
    expect([...e].filter((key) => !k.has(key))).toEqual([]);
    expect([...k].filter((key) => !e.has(key))).toEqual([]);
  });
});

describe("assistant messages", () => {
  const files = readdirSync("src/components/assistant").map((f) => join("src/components/assistant", f));
  const keys = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/useTranslations\("([A-Za-z.]+)"\)/g)) {
      // every t("key") of a file that reads this namespace
      for (const k of text.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) keys.add(`${m[1]}.${k[1]}`);
    }
  }
  // Keys built from a value at run time.
  for (const tool of ["list_sources", "list_documents", "get_changes", "get_document", "get_document_text", "compare_versions", "propose_action", "other"]) {
    keys.add(`assistant.tools.${tool}`);
  }
  for (const kind of ["scan_source", "scan_all", "resummarize", "test_mail", "weekly_preview"]) keys.add(`assistant.action.${kind}`);
  for (const kind of ["source", "document"]) keys.add(`assistant.pageKind.${kind}`);

  it("finds the keys the components use", () => {
    expect(keys.size).toBeGreaterThan(30);
  });

  for (const [name, messages] of [["English", en], ["Korean", ko]] as const) {
    it(`${name} has every key the assistant components use`, () => {
      const missing = [...keys].filter((key) => !has(messages as Record<string, unknown>, key));
      expect(missing).toEqual([]);
    });
  }
});
