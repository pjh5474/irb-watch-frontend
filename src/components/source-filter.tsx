"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function SourceFilter({
  sources,
  current,
}: {
  sources: { id: number; name: string }[];
  current: number | null;
}) {
  const t = useTranslations("feed");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      {t("filterLabel")}
      <select
        value={current ?? ""}
        onChange={(e) => router.push(e.target.value ? `${pathname}?source=${e.target.value}` : pathname)}
        className="rounded border px-2 py-1"
      >
        <option value="">{t("allSources")}</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
