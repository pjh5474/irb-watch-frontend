import { apiFetch } from "@/lib/api/client";

// The signed-in user's own R-BAY login (server: /me/rbay-login). The password goes to the server
// once, is encrypted there and never comes back: every answer carries the status only. Saving and
// testing answer with status "testing" (a login takes 5-20 s on the server); poll until it ends.

export type RbayLoginStatus = "untested" | "testing" | "ok" | "rejected" | "failed";

export type RbayLogin = {
  has_login: boolean;
  login_hint: string | null; // the first two characters of the ID, e.g. "ab***"
  status: RbayLoginStatus;
  last_error: string | null; // R-BAY's own reason or ours; never the password
  last_tested_at: string | null;
  last_ok_at: string | null;
};

export const MAX_RBAY_FIELD = 200;
export const TEST_POLL_MS = 2_000;
export const TEST_MAX_POLLS = 40; // about 80 s; the test itself is capped at 20 s plus the logout

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const rbayLoginApi = {
  get: () => apiFetch<RbayLogin>("/me/rbay-login"),
  save: (loginId: string, password: string) =>
    apiFetch<RbayLogin>("/me/rbay-login", { method: "PUT", body: JSON.stringify({ login_id: loginId, password }) }),
  test: () => apiFetch<RbayLogin>("/me/rbay-login/test", { method: "POST" }),
  remove: () => apiFetch<void>("/me/rbay-login", { method: "DELETE" }),
};

/** Polls until the test ends (status is not "testing") or the polls run out; returns the last answer. */
export async function waitForTest(
  first: RbayLogin,
  pollMs: number = TEST_POLL_MS,
  maxPolls: number = TEST_MAX_POLLS,
  get: () => Promise<RbayLogin> = rbayLoginApi.get,
): Promise<RbayLogin> {
  let current = first;
  for (let i = 0; i < maxPolls && current.status === "testing"; i++) {
    await pause(pollMs);
    current = await get();
  }
  return current;
}
