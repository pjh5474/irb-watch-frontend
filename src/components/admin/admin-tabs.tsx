"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The admin area's two parts. The page you are on is marked with aria-current.
export function AdminTabs() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/sources", label: t("tabs.sources"), active: pathname.startsWith("/admin/sources") },
    { href: "/admin/assistant", label: t("tabs.assistant"), active: pathname.startsWith("/admin/assistant") },
  ];
  return (
    <nav aria-label="Admin" className="mx-auto flex w-full max-w-3xl gap-1 px-6 pt-4 text-sm">
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
