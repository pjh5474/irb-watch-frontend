import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminSource } from "@/components/admin/admin-source";

export default async function AdminSourcePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  return <AdminSource id={Number(id)} />;
}
