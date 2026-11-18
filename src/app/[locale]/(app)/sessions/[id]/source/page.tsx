import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SessionSourceView } from "@/components/calendar/session-source";

/** Why an IRB date was suggested: the post it came from, for every signed-in user. */
export default async function SessionSourcePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d+$/.test(id)) notFound();
  return <SessionSourceView sessionId={Number(id)} />;
}
