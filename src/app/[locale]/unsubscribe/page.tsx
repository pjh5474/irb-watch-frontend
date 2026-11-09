import { setRequestLocale } from "next-intl/server";
import { UnsubscribeForm } from "@/components/unsubscribe-form";

// Public page (see src/lib/public-pages.ts). The token comes from the link in a digest mail.
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  return <UnsubscribeForm token={token && token.length <= 200 ? token : null} />;
}
