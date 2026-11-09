import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Dev server opened as http://127.0.0.1:3000 is a different origin from localhost, and
  // Next blocks its HMR socket and fonts. Dev only; has no effect in production.
  allowedDevOrigins: ["127.0.0.1"],
  // The scaffold enabled cacheComponents and partialPrefetching. Removed: every page here
  // depends on the signed-in user's cookies, so they would only add Suspense plumbing.
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
