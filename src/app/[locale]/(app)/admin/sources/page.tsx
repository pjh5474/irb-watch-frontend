import { setRequestLocale } from "next-intl/server";
import { AdminSources } from "@/components/admin/admin-sources";

export default async function AdminSourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminSources />;
}
