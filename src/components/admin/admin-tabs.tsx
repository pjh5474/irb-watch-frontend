"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The admin area's parts. The page you are on is marked with aria-current.
export function AdminTabs() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/sources", label: t("tabs.sources"), active: pathname.startsWith("/admin/sources") },
    { href: "/admin/reviews", label: t("tabs.reviews"), active: pathname.startsWith("/admin/reviews") },
    { href: "/admin/guides", label: t("tabs.guides"), active: pathname.startsWith("/admin/guides") },
    { href: "/admin/templates", label: t("tabs.templates"), active: pathname.startsWith("/admin/templates") },
    { href: "/admin/ai", label: t("tabs.ai"), active: pathname.startsWith("/admin/ai") },
    { href: "/admin/assistant", label: t("tabs.assistant"), active: pathname.startsWith("/admin/assistant") },
    { href: "/admin/organizations", label: t("tabs.organizations"), active: pathname.startsWith("/admin/organizations") },
  ];
  return (
    <nav aria-label="Admin" className="mx-auto flex w-full max-w-6xl flex-wrap gap-1 px-6 pt-4 text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`rounded px-3 py-1.5 ${tab.active ? "bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
