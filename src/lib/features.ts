// Feature switches set at build time (NEXT_PUBLIC_*, inlined by Next).
//
// The docs generator (AI drafts, guides, form templates) is hidden unless
// NEXT_PUBLIC_DOCGEN_ENABLED is "true" (owner, 2026-11-14): document writing moves to a separate
// agent later. The code and the server routes stay; only the screens are hidden. Read on every
// call so tests can switch it with vi.stubEnv.
export function docgenEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DOCGEN_ENABLED === "true";
}
