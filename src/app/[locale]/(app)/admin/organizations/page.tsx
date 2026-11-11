import { setRequestLocale } from "next-intl/server";
import { OrganizationAdmin } from "@/components/admin/organization-admin";

export default async function AdminOrganizationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OrganizationAdmin />;
}
