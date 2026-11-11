import { setRequestLocale } from "next-intl/server";
import { UserAdmin } from "@/components/admin/user-admin";

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <UserAdmin />;
}
