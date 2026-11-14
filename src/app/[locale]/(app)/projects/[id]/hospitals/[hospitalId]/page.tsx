import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HospitalView } from "@/components/pipelines/hospital-view";

export default async function HospitalPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; hospitalId: string }>;
}) {
  const { locale, id, hospitalId } = await params;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(hospitalId)) notFound();
  return <HospitalView projectId={Number(id)} hospitalId={Number(hospitalId)} />;
}
