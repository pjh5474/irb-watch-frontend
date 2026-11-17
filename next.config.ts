import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Dev server opened as http://127.0.0.1:3000 is a different origin from localhost, and
  // Next blocks its HMR socket and fonts. Dev only; has no effect in production.
  allowedDevOrigins: ["127.0.0.1"],
  // The scaffold enabled cacheComponents and partialPrefetching. Removed: every page here
  // depends on the signed-in user's cookies, so they would only add Suspense plumbing.
  // The browser keeps a page it already showed for 60 s, so going back to it is instant
  // instead of a white wait. The cache lives in the user's own browser (never shared).
  // router.refresh() and a full reload clear it; the data changes mostly once a day (the scan).
  experimental: {
    staleTimes: { dynamic: 60 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
