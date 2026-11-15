import { setRequestLocale } from "next-intl/server";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CalendarView />;
}
