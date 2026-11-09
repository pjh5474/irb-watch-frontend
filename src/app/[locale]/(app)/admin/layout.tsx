import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getAccessState } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Admin area guard. This is a screen-level hint only: every admin call goes to the API,
// which re-reads the role from the database on each request.
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const access = await getAccessState(await createClient());

  if (!access) {
    const t = await getTranslations("admin");
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!access.isAdmin) notFound();
  return <>{children}</>;
}
