import { setRequestLocale } from "next-intl/server";
import { SessionAdmin } from "@/components/admin/session-admin";

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SessionAdmin />;
}
