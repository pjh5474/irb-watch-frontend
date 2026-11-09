import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { LocaleSwitch, SignOutButton } from "@/components/header-controls";
import { NavProgress } from "@/components/nav-progress";
import { ServerStatus } from "@/components/server-status";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect({ href: "/login", locale });

  // UI hint only: the server re-checks the role on every admin call.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId!)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  const t = await getTranslations("nav");
  return (
    <>
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-semibold">IRB Watch</span>
        <nav className="flex flex-1 gap-4 text-sm">
          <Link href="/">{t("feed")}</Link>
          <Link href="/sources">{t("sources")}</Link>
          <Link href="/settings">{t("settings")}</Link>
          {isAdmin && <Link href="/admin">{t("admin")}</Link>}
        </nav>
        <ServerStatus />
        <LocaleSwitch />
        <SignOutButton />
      </header>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      {children}
      <AssistantPanel />
    </>
  );
}
