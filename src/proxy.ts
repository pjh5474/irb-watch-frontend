import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleIntl = createIntlMiddleware(routing);

// Locale routing first, then refresh the Supabase session cookie on that same response,
// then send signed-out visitors to the login page. This is a UX redirect only: the data
// stays protected by RLS and the API re-checks every token.
export async function proxy(request: NextRequest) {
  const response = handleIntl(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const hasLocale = (routing.locales as readonly string[]).includes(segments[0]);
  const locale = hasLocale ? segments[0] : routing.defaultLocale;
  const onLogin = (hasLocale ? segments[1] : segments[0]) === "login";

  if (!signedIn && !onLogin) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
  if (signedIn && onLogin) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
