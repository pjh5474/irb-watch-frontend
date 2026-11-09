"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function LocaleSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <Link
      href={pathname}
      locale={locale === "ko" ? "en" : "ko"}
      className="text-sm underline-offset-4 hover:underline"
    >
      {t("language")}
    </Link>
  );
}

export function SignOutButton() {
  const t = useTranslations("nav");
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={signOut} className="text-sm underline-offset-4 hover:underline">
      {t("signOut")}
    </button>
  );
}
