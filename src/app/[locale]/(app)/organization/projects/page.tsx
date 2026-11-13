import { setRequestLocale } from "next-intl/server";
import { OrganizationProjects } from "@/components/projects/organization-projects";

export default async function OrganizationProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OrganizationProjects />;
}
