import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AccessState = { isAdmin: boolean; memberOf: ReadonlySet<number> };

// What the signed-in user may open. UI hint only: row-level security still decides what the
// database returns. Returns null when it could not be read: a failed lookup must never look
// like "no access" (an admin would see every members-only board as locked), so the page
// shows a load error.
export async function getAccessState(supabase: Client): Promise<AccessState | null> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile, error: profileError }, { data: rows, error: membersError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    // A user can read only their own rows of source_members (row-level security).
    supabase.from("source_members").select("source_id").eq("user_id", userId),
  ]);
  if (profileError || membersError || !profile) return null;
  return {
    isAdmin: profile.role === "admin",
    memberOf: new Set((rows ?? []).map((r) => r.source_id)),
  };
}

// Mirrors the database rule private.can_read_source: a members-only source (a study) is
// readable by admins and by the users an admin assigned to it. A non-member normally never
// even receives the source row, so this is a second line of defense for the screens.
export function isLocked(source: { id: number; requires_login: boolean }, access: AccessState) {
  return source.requires_login && !access.isAdmin && !access.memberOf.has(source.id);
}
