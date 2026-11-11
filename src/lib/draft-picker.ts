import { createClient } from "@/lib/supabase/client";

// Reads for the draft form's document picker. They go straight to Supabase under the user's
// own login: row-level security returns only sources and documents the user may read, the
// same rule the server checks again when the draft is written.

export type PickerSource = { id: number; name: string; requires_login: boolean; ai_enabled: boolean };
export type PickerDocument = {
  id: number;
  title: string;
  posted_on: string | null;
  source_id: number;
  // Set when the post was found by attachment names (in its newest version), not its title.
  matched_files?: string[];
};
export type PickerVersion = { version_no: number; created_at: string };

export async function pickerSources(): Promise<PickerSource[]> {
  const { data, error } = await createClient()
    .from("sources")
    .select("id, name, requires_login, ai_enabled")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const PICKER_LIMIT = 20;
const FILE_ROWS = 200; // attachment rows read per file-name search

/** Newest post first: posted date, then id; posts without a date last. Not by id alone: a first
 * scan stores a board's posts in list order (newest first), so the newest post can have the
 * smallest id. */
export function newestFirst(a: PickerDocument, b: PickerDocument): number {
  if (a.posted_on !== b.posted_on) {
    if (a.posted_on === null) return 1;
    if (b.posted_on === null) return -1;
    return a.posted_on < b.posted_on ? 1 : -1;
  }
  return b.id - a.id;
}

/** Title matches and file-name matches as one list. A post whose title matches is listed as a
 * title match (all its files ticked when added); the others carry the matching file names. */
export function mergeMatches(
  byTitle: PickerDocument[],
  byFile: PickerDocument[],
  files: Map<number, string[]>,
): PickerDocument[] {
  const titled = new Set(byTitle.map((d) => d.id));
  const found = byFile
    .filter((d) => !titled.has(d.id))
    .map((d) => ({ ...d, matched_files: files.get(d.id) ?? [] }));
  return [...byTitle, ...found].sort(newestFirst);
}

/** At most PICKER_LIMIT posts, newest first; `more` says there are more (one extra row is read
 * to know). A search matches the post title or an attachment name in the post's newest version.
 * '%' and '_' in the search are matched literally. */
export async function pickerDocuments(
  sourceId: number,
  search: string,
): Promise<{ documents: PickerDocument[]; more: boolean }> {
  const supabase = createClient();
  const columns = "id, title, posted_on, source_id";
  const ordered = <Q extends { order: (c: string, o: object) => Q; limit: (n: number) => Q }>(q: Q) =>
    q.order("posted_on", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(PICKER_LIMIT + 1);

  const clean = search.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!clean) {
    const { data, error } = await ordered(supabase.from("documents").select(columns).eq("source_id", sourceId));
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return { documents: rows.slice(0, PICKER_LIMIT), more: rows.length > PICKER_LIMIT };
  }

  const pattern = `%${clean}%`;
  const [titles, fileRows] = await Promise.all([
    ordered(supabase.from("documents").select(columns).eq("source_id", sourceId).ilike("title", pattern)),
    supabase
      .from("document_version_files")
      .select("filename, version_id")
      .eq("source_id", sourceId)
      .ilike("filename", pattern)
      .limit(FILE_ROWS),
  ]);
  if (titles.error) throw new Error(titles.error.message);
  if (fileRows.error) throw new Error(fileRows.error.message);

  // Only files of each post's newest version count: the post must have it as latest_version_id.
  const namesByVersion = new Map<number, string[]>();
  for (const f of fileRows.data ?? []) {
    const names = namesByVersion.get(f.version_id) ?? [];
    if (!names.includes(f.filename)) names.push(f.filename);
    namesByVersion.set(f.version_id, names);
  }
  let byFile: PickerDocument[] = [];
  const files = new Map<number, string[]>();
  let fileMore = false;
  if (namesByVersion.size > 0) {
    const { data, error } = await ordered(
      supabase
        .from("documents")
        .select(`${columns}, latest_version_id`)
        .eq("source_id", sourceId)
        .in("latest_version_id", [...namesByVersion.keys()]),
    );
    if (error) throw new Error(error.message);
    for (const d of data ?? []) files.set(d.id, namesByVersion.get(d.latest_version_id!) ?? []);
    byFile = (data ?? []).map((d) => ({ id: d.id, title: d.title, posted_on: d.posted_on, source_id: d.source_id }));
    fileMore = byFile.length > PICKER_LIMIT;
  }
  const merged = mergeMatches((titles.data ?? []).slice(0, PICKER_LIMIT + 1), byFile, files);
  const more =
    merged.length > PICKER_LIMIT ||
    (titles.data?.length ?? 0) > PICKER_LIMIT ||
    fileMore ||
    (fileRows.data?.length ?? 0) >= FILE_ROWS;
  return { documents: merged.slice(0, PICKER_LIMIT), more };
}

export type PickerFile = { filename: string; no_text: boolean };

/** The attached files of one version (null = the newest), by name. */
export async function pickerFiles(documentId: number, versionNo: number | null): Promise<PickerFile[]> {
  const supabase = createClient();
  let query = supabase.from("document_versions").select("id").eq("document_id", documentId);
  query = versionNo === null ? query.order("version_no", { ascending: false }) : query.eq("version_no", versionNo);
  const { data: rows, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];
  const { data, error: fileError } = await supabase
    .from("document_version_files")
    .select("filename, hash_only_reason, extract_note")
    .eq("version_id", rows[0].id)
    .order("filename");
  if (fileError) throw new Error(fileError.message);
  return (data ?? []).map((f) => ({
    filename: f.filename,
    no_text: f.hash_only_reason !== null || f.extract_note !== null,
  }));
}

/** Titles of documents the user may read (others are simply missing). */
export async function pickerTitles(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await createClient().from("documents").select("id, title").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((d) => [d.id, d.title]));
}

/** The versions users see (silent "resaved" ones are hidden, as on the document page). */
export async function pickerVersions(documentId: number): Promise<PickerVersion[]> {
  const { data, error } = await createClient()
    .from("document_versions")
    .select("version_no, created_at")
    .eq("document_id", documentId)
    .neq("change_type", "resaved")
    .order("version_no", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
