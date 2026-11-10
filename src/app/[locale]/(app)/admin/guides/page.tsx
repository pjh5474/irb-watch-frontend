import { setRequestLocale } from "next-intl/server";
import { GuideLibrary } from "@/components/admin/guide-library";

export default async function AdminGuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GuideLibrary />;
}
