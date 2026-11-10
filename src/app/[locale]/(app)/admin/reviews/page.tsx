import { setRequestLocale } from "next-intl/server";
import { ReviewList } from "@/components/admin/review-list";

export default async function AdminReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReviewList />;
}
