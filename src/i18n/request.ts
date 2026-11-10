import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export const TIME_ZONE = "Asia/Seoul";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Every date and time is shown in Korean time, the hospitals' and the scheduler's zone
    // (backend SCAN_TIMEZONE). Without this, next-intl uses the server's zone (UTC on Vercel)
    // and passes it on to the browser, so times were 9 hours off.
    timeZone: TIME_ZONE,
  };
});
