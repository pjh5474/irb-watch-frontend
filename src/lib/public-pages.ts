// Pages that work without signing in. Everything else sends a signed-out visitor to the login
// page (src/proxy.ts). "unsubscribe" is the page the link in every digest mail opens: the signed
// token in the address is the proof, there is nothing to sign in for.
export const PUBLIC_PAGES = ["login", "unsubscribe"] as const;

export function isPublicPage(page: string | undefined): boolean {
  return page !== undefined && (PUBLIC_PAGES as readonly string[]).includes(page);
}
