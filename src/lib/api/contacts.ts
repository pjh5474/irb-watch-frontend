import { apiFetch } from "@/lib/api/client";

// A hospital's IRB office contacts. Users read them straight from Supabase (table
// hospital_contacts, readable by every signed-in user); admins type fields through the API.

export const CONTACT_FIELDS = ["phone", "fax", "email"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ErrorKind = "login_rejected" | "site_unavailable" | "layout_changed" | "other";

export type StaffEntry = { title: string; name: string; email: string; tel: string };
export type StaffGroup = { tab: string; entries: StaffEntry[] };

/** The columns the browser may read (no raw error detail). */
export type ContactsRow = {
  hospital_id: number;
  scanned_phone: string;
  scanned_fax: string;
  scanned_email: string;
  manual_phone: string | null;
  manual_fax: string | null;
  manual_email: string | null;
  check_status: "never" | "ok" | "failed";
  checked_at: string | null;
  last_ok_at: string | null;
  error_kind: ErrorKind | null;
  staff: unknown;
  staff_status: "never" | "none" | "ok" | "failed";
  staff_error_kind: ErrorKind | null;
};

export const CONTACT_COLUMNS =
  "hospital_id, scanned_phone, scanned_fax, scanned_email, manual_phone, manual_fax, manual_email, " +
  "check_status, checked_at, last_ok_at, error_kind, staff, staff_status, staff_error_kind";

export type ShownField = { text: string; from: "admin" | "r-bay" | "none" };

/** What the screen shows for a field: a typed text wins, else the scanned one, else "none". */
export function shownField(row: ContactsRow | null, field: ContactField): ShownField {
  if (!row) return { text: "", from: "none" };
  const typed = row[`manual_${field}`];
  if (typed) return { text: typed, from: "admin" };
  const scanned = row[`scanned_${field}`];
  return scanned ? { text: scanned, from: "r-bay" } : { text: "", from: "none" };
}

/** The saved staff as groups; anything that is not the expected shape is dropped, never thrown on. */
export function staffGroups(value: unknown): StaffGroup[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return value.flatMap((g): StaffGroup[] => {
    if (!g || typeof g !== "object" || !Array.isArray((g as { entries?: unknown }).entries)) return [];
    const entries = ((g as { entries: unknown[] }).entries).flatMap((e): StaffEntry[] =>
      e && typeof e === "object"
        ? [{
            title: text((e as StaffEntry).title),
            name: text((e as StaffEntry).name),
            email: text((e as StaffEntry).email),
            tel: text((e as StaffEntry).tel),
          }]
        : [],
    );
    return entries.length ? [{ tab: text((g as StaffGroup).tab), entries }] : [];
  });
}

/** What the admin route answers (adds the typed values and the raw reasons). */
export type AdminContacts = {
  hospital_id: number;
  scanned: Record<ContactField, string>;
  manual: Record<ContactField, string | null>;
  shown: Record<ContactField, string>;
  shown_from: Record<ContactField, "admin" | "r-bay" | "none">;
  check_status: string;
  checked_at: string | null;
  last_ok_at: string | null;
  error_kind: ErrorKind | null;
  error_detail: string | null;
  staff_status: string;
  staff_error_kind: ErrorKind | null;
  staff_error_detail: string | null;
};

export const contactsApi = {
  // Only the fields sent change; null or blank clears a typed field.
  save: (hospitalId: number, body: Partial<Record<ContactField, string | null>>) =>
    apiFetch<AdminContacts>(`/admin/hospitals/${hospitalId}/contacts`, { method: "PUT", body: JSON.stringify(body) }),
  get: (hospitalId: number) => apiFetch<AdminContacts>(`/admin/hospitals/${hospitalId}/contacts`),
};
