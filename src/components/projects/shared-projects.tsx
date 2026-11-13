"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { errorText } from "@/components/pipelines/shared";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/client";
import { projectApi } from "@/lib/api/projects";

/** Projects other users shared with me (phase B1), with their owner's name. Nothing when none. */
export function SharedProjects() {
  const t = useTranslations("sharing");
  const tp = useTranslations("pipelines");
  const shared = useQuery({ queryKey: ["projects", "shared"], queryFn: projectApi.shared });
  if (shared.isError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {errorText(shared.error, tp)}
      </p>
    );
  if (!shared.data?.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">{t("sharedWithMe")}</h2>
      <ul className="flex flex-col gap-2">
        {shared.data.map((p) => (
          <li key={p.project_id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm">
            <Link href={`/projects/${p.project_id}`} className="font-medium underline-offset-4 hover:underline">
              {p.name}
            </Link>
            <span className="text-xs opacity-70">{t("ownedBy", { name: p.owner?.name ?? t("unknown") })}</span>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{t(p.role === "pm" ? "pm" : "member")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A link to the organization's projects, shown only to whom the server lets list them. */
export function OrganizationProjectsLink() {
  const t = useTranslations("sharing");
  const org = useQuery({ queryKey: ["organization", "projects", null], queryFn: () => projectApi.organization(), retry: false });
  // 403 = not an organization admin: nothing to show (not an error for this user).
  if (org.error instanceof ApiError && org.error.status === 403) return null;
  if (!org.isSuccess) return null;
  return (
    <p className="text-sm">
      <Link href="/organization/projects" className="underline underline-offset-4">
        {t("organizationProjects", { n: org.data.length })}
      </Link>
    </p>
  );
}
