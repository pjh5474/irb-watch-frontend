import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ko from "../messages/ko.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

// next-intl throws for the whole provider (and the page never hydrates) if a key has a dot.
function dottedKeys(obj: Record<string, unknown>): string[] {
  return Object.entries(obj).flatMap(([k, v]) => [
    ...(k.includes(".") ? [k] : []),
    ...(v && typeof v === "object" ? dottedKeys(v as Record<string, unknown>) : []),
  ]);
}

describe("messages", () => {
  it("ko and en define the same keys", () => {
    expect(keys(ko).sort()).toEqual(keys(en).sort());
  });
  it("no key contains a dot", () => {
    expect(dottedKeys(ko)).toEqual([]);
    expect(dottedKeys(en)).toEqual([]);
  });
});
