import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The docs generator is switched on in tests so its screens stay covered; tests that check it
  // switched off use vi.stubEnv (tests/docgen-off.test.tsx, and one case each in work and
  // pipeline-setup).
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"], env: { NEXT_PUBLIC_DOCGEN_ENABLED: "true" } },
});
