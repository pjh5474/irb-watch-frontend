import { describe, expect, it } from "vitest";
import { groupFiles, innerName } from "../src/lib/file-groups";

const row = (id: number, filename: string) => ({ id, filename });

describe("groupFiles", () => {
  it("keeps a plain file and a zip that has nothing inside as single rows", () => {
    const entries = groupFiles([row(1, "b.pdf"), row(2, "a.zip"), row(3, "c.hwp")]);
    expect(entries.map((e) => (e.kind === "file" ? e.file.filename : e.zip.filename))).toEqual([
      "a.zip",
      "b.pdf",
      "c.hwp",
    ]);
  });

  it("groups members under the zip and shows the path inside it", () => {
    const entries = groupFiles([
      row(1, "forms.zip"),
      row(2, "forms.zip/z.pdf"),
      row(3, "forms.zip/dir/a.pdf"),
      row(4, "readme.pdf"),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["zip", "file"]);
    const zip = entries[0];
    expect(zip.kind).toBe("zip");
    if (zip.kind !== "zip") return;
    expect(zip.members.map((m) => innerName(zip.zip.filename, m.filename))).toEqual(["dir/a.pdf", "z.pdf"]);
    expect(entries[1]).toMatchObject({ kind: "file", file: { filename: "readme.pdf" } });
  });

  it("leaves a slash name alone when its zip row is missing", () => {
    const entries = groupFiles([row(1, "gone.zip/a.pdf"), row(2, "note.pdf")]);
    expect(entries.every((e) => e.kind === "file")).toBe(true);
    expect(entries.map((e) => (e.kind === "file" ? e.file.filename : ""))).toEqual(["gone.zip/a.pdf", "note.pdf"]);
  });

  it("keeps a zip stored inside another zip as one member", () => {
    const entries = groupFiles([row(1, "outer.zip"), row(2, "outer.zip/inner.zip")]);
    const zip = entries[0];
    expect(zip.kind).toBe("zip");
    if (zip.kind !== "zip") return;
    expect(zip.members.map((m) => m.filename)).toEqual(["outer.zip/inner.zip"]);
  });
});
