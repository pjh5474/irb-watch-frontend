import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";

// Every t("key") used by a component that reads the "admin" messages must exist in both
// languages: next-intl does not check this at build time, a missing key shows up as an error
// on the page.
const DIRS = ["src/components/admin", "src/app/[locale]/(app)/admin"];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function has(messages: Record<string, unknown>, path: string): boolean {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("admin messages", () => {
  const keys = new Set<string>();
  for (const file of DIRS.flatMap(files)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes('useTranslations("admin")') && !text.includes('getTranslations("admin")')) continue;
    for (const m of text.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) keys.add(m[1]);
  }
  // error-text.ts receives t as a parameter, so its keys are listed here.
  keys.add("errors.unreachable");
  keys.add("errors.generic");

  it("finds the keys the screens use", () => {
    expect(keys.size).toBeGreaterThan(40);
  });

  it.each([...keys].sort())("%s exists in en and ko", (key) => {
    expect(has(en.admin, key), `en.admin.${key}`).toBe(true);
    expect(has(ko.admin, key), `ko.admin.${key}`).toBe(true);
  });
});
