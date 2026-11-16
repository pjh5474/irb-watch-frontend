type NamedFile = { id: number; filename: string };

export type FileEntry<T extends NamedFile> =
  | { kind: "file"; file: T }
  | { kind: "zip"; zip: T; members: T[] };

/** The path inside a zip. "forms.zip/dir/a.pdf" with zip "forms.zip" is "dir/a.pdf". */
export function innerName(zipName: string, filename: string): string {
  const prefix = `${zipName}/`;
  return filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, "ko");
}

/**
 * Files inside a zip are stored as "<zip name>/<path inside>". A zip that has such files
 * becomes one group. A zip with none, and a slash name whose zip row is missing, stay single
 * files. A zip inside a zip is one stored file, so it stays a member of the outer zip.
 */
export function groupFiles<T extends NamedFile>(files: T[]): FileEntry<T>[] {
  const names = new Set(files.map((f) => f.filename));
  const membersOf = new Map<string, T[]>();
  const inside = new Set<number>();

  for (const file of files) {
    const slash = file.filename.indexOf("/");
    if (slash <= 0) continue;
    const parent = file.filename.slice(0, slash);
    if (!names.has(parent)) continue;
    const list = membersOf.get(parent) ?? [];
    list.push(file);
    membersOf.set(parent, list);
    inside.add(file.id);
  }

  const entries: FileEntry<T>[] = [];
  for (const file of files) {
    if (inside.has(file.id)) continue;
    const members = membersOf.get(file.filename);
    if (members && members.length > 0) {
      members.sort((a, b) => byName(innerName(file.filename, a.filename), innerName(file.filename, b.filename)));
      entries.push({ kind: "zip", zip: file, members });
    } else {
      entries.push({ kind: "file", file });
    }
  }
  entries.sort((a, b) =>
    byName(a.kind === "zip" ? a.zip.filename : a.file.filename, b.kind === "zip" ? b.zip.filename : b.file.filename),
  );
  return entries;
}
