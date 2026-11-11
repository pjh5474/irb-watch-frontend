import { setRequestLocale } from "next-intl/server";
import { TemplateLibrary } from "@/components/admin/template-library";

export default async function AdminTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TemplateLibrary />;
}
