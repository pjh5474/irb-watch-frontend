import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * A PostgREST `or` filter for "my projects": the ones I own and the ones shared with me (phase
 * B1). Row-level security also lets organization admins and platform admins read other
 * projects; pickers and lists use this so they show only the user's own working set.
 */
export async function myProjectsFilter(supabase: SupabaseClient<Database>): Promise<string> {
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub ?? "00000000-0000-0000-0000-000000000000";
  const { data: rows } = await supabase.from("project_members").select("project_id");
  const ids = (rows ?? []).map((r) => r.project_id).filter((id) => Number.isInteger(id));
  return ids.length ? `user_id.eq.${me},id.in.(${ids.join(",")})` : `user_id.eq.${me}`;
}
