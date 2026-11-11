import { createClient } from "@/lib/supabase/client";

// Reads for the draft form's document picker. They go straight to Supabase under the user's
// own login: row-level security returns only sources and documents the user may read, the
// same rule the server checks again when the draft is written.

export type PickerSource = { id: number; name: string; requires_login: boolean; ai_enabled: boolean };
export type PickerDocument = { id: number; title: string; posted_on: string | null; source_id: number };
export type PickerVersion = { version_no: number; created_at: string };

export async function pickerSources(): Promise<PickerSource[]> {
  const { data, error } = await createClient()
    .from("sources")
    .select("id, name, requires_login, ai_enabled")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Newest first, at most 20; '%' and '_' in the search are matched literally. */
export async function pickerDocuments(sourceId: number, search: string): Promise<PickerDocument[]> {
  let query = createClient()
    .from("documents")
    .select("id, title, posted_on, source_id")
    .eq("source_id", sourceId);
  const clean = search.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  if (clean) query = query.ilike("title", `%${clean}%`);
  const { data, error } = await query.order("id", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
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
