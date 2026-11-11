import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChangePassword } from "@/components/change-password";
import { DigestToggle } from "@/components/digest-toggle";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  // Under row-level security this is only the user's own row. No row = the digest is on.
  const { data: prefs, error } = userId
    ? await supabase.from("notification_prefs").select("digest_enabled").eq("user_id", userId).maybeSingle()
    : { data: null, error: new Error("not signed in") };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <section className="flex flex-col gap-3 rounded border p-4">
        <h2 className="font-medium">{t("mailTitle")}</h2>
        {error || !userId ? (
          // A failed read must not look like "on": the toggle is not shown at all.
          <p role="alert" className="text-sm text-red-600">
            {t("loadError")}
          </p>
        ) : (
          <>
            <DigestToggle userId={userId} initial={prefs?.digest_enabled ?? true} />
            <p className="text-xs opacity-70">{t("studiesNote")}</p>
          </>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded border p-4">
        <h2 className="font-medium">{t("pwTitle")}</h2>
        <ChangePassword />
      </section>
    </main>
  );
}
