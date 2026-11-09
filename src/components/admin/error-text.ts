import { ApiError } from "@/lib/api/client";

// The text shown for a failed admin call. Admin screens show the server's own reason (it is
// written for admins and never contains secrets); only "no answer at all" gets our wording.
// A 401/403 never gets here: the API wrapper signs the user out first.
export function adminErrorText(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return t("errors.unreachable");
    if (error.message) return error.message;
  }
  return t("errors.generic");
}
