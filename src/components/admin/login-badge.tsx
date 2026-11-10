"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/admin/badge";
import { adminErrorText } from "@/components/admin/error-text";
import { adminApi, loginSite, type AdminSource, type StoredLogin } from "@/lib/api/admin";

// One list of the stored hospital logins, shared by the sources list and the source page (the
// same query key, so saving or deleting a login on the source page updates the list too).
export const LOGINS_KEY = ["admin", "logins"] as const;

export type LoginState =
  | "none" // the source needs no stored login
  | "stored"
  | "missing"
  | "checking"
  | "unknown"; // the list of logins could not be read: never shown as "fine"

/** True for a source that scans with a stored hospital login (a study account). */
export function needsLogin(source: AdminSource): boolean {
  return Boolean(source.login_user);
}

export function useStoredLogins(sources: AdminSource[] | undefined): UseQueryResult<StoredLogin[]> {
  // Only ask the server when some source actually needs a login.
  return useQuery({
    queryKey: LOGINS_KEY,
    queryFn: adminApi.logins,
    enabled: Boolean(sources?.some(needsLogin)),
  });
}

export function loginStateOf(source: AdminSource, logins: UseQueryResult<StoredLogin[]>): LoginState {
  if (!needsLogin(source)) return "none";
  // An address with no board key can never have a login filed for it.
  const site = loginSite(source);
  if (!site) return "missing";
  if (logins.isError) return "unknown";
  if (!logins.data) return "checking";
  return logins.data.some((l) => l.owner_label === source.login_user && l.site === site) ? "stored" : "missing";
}

export function LoginBadge({
  state,
  error,
}: {
  state: LoginState;
  error?: unknown;
}) {
  const t = useTranslations("admin");
  if (state === "none") return null;
  if (state === "stored") return <Badge tone="good">{t("loginBadge.stored")}</Badge>;
  if (state === "missing") return <Badge tone="warn">{t("loginBadge.missing")}</Badge>;
  if (state === "unknown") {
    return (
      <Badge title={error ? adminErrorText(error, t) : undefined}>{t("loginBadge.unknown")}</Badge>
    );
  }
  return <Badge>{t("loginBadge.checking")}</Badge>;
}
