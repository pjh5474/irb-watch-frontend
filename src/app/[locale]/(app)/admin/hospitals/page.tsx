import { setRequestLocale } from "next-intl/server";
import { HospitalAdmin } from "@/components/admin/hospital-admin";

export default async function AdminHospitalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HospitalAdmin />;
}
