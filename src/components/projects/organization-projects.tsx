"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorText } from "@/components/pipelines/shared";
import { Link } from "@/i18n/navigation";
import { orgApi } from "@/lib/api/organizations";
import { projectApi } from "@/lib/api/projects";

/**
 * Every pipeline project of the user's organization (organization admins; phase B1), with its
 * owner, PM and member count. Each opens the project page, where members, the PM and a
 * hand-over are managed.
 */
export function OrganizationProjects() {
  const t = useTranslations("sharing");
  const tp = useTranslations("pipelines");
  const [org, setOrg] = useState<string>("");
  const list = useQuery({
    queryKey: ["organization", "projects", org || null],
    queryFn: () => projectApi.organization(org || undefined),
  });
  // Platform admins may look at any organization (read-only outside their own); for everyone
  // else this list is refused and the picker is not shown.
  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: () => orgApi.list(), retry: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <Link href="/projects" className="text-sm underline-offset-4 hover:underline">
        ← {t("backToProjects")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("organizationTitle")}</h1>
      {orgs.isSuccess && orgs.data.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {t("organization")}
          <select className="rounded border px-2 py-1" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">{t("myOrganization")}</option>
            {orgs.data.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {list.isLoading && <p className="text-sm opacity-70">{tp("loading")}</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorText(list.error, tp)}
        </p>
      )}
      {list.data?.length === 0 && <p className="text-sm opacity-70">{t("organizationEmpty")}</p>}
      <ul className="flex flex-col gap-2">
        {(list.data ?? []).map((p) => (
          <li key={p.project_id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm">
            <Link href={`/projects/${p.project_id}`} className="font-medium underline-offset-4 hover:underline">
              {p.name}
            </Link>
            <span className="text-xs opacity-70">{t("ownedBy", { name: p.owner?.name ?? t("unknown") })}</span>
            <span className="text-xs opacity-70">{p.pm ? t("pmIs", { name: p.pm.name }) : t("noPm")}</span>
            <span className="text-xs opacity-70">{t("memberCount", { n: p.members })}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
