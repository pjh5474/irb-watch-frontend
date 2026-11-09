import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AccessState = { isAdmin: boolean; proven: ReadonlySet<number> };

// What the signed-in user may open. UI hint only: row-level security still decides what the
// database returns, this just lets a page say "locked" instead of showing an empty list.
export async function getAccessState(supabase: Client): Promise<AccessState> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { isAdmin: false, proven: new Set() };

  const [{ data: profile }, { data: proofs }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("source_access")
      .select("source_id")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return {
    isAdmin: profile?.role === "admin",
    proven: new Set((proofs ?? []).map((p) => p.source_id)),
  };
}

// Mirrors the database rule private.can_read_source: members-only sources are readable by
// admins and by users holding an unexpired proof of access.
export function isLocked(source: { id: number; requires_login: boolean }, access: AccessState) {
  return source.requires_login && !access.isAdmin && !access.proven.has(source.id);
}
