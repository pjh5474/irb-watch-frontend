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
