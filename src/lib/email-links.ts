/**
 * Splits a contact text into plain parts and real email addresses, so only a valid address becomes
 * a link and everything else stays plain text. Hospitals write anything in these fields ("_",
 * "DRB", "(평일 08:30 ~ 17:30)", two addresses with a slash), so the text is never linked as a
 * whole. The pattern is strict on purpose: it allows no space, quote, angle bracket, "?" or "&".
 */
export type TextPart = { kind: "text"; text: string } | { kind: "email"; text: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function emailParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(EMAIL)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "email", text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/** The page a click on an address opens (Hiworks' new-mail page; owner, 2026-11-17). The address
 * is copied to the clipboard first, because Hiworks' page is not known to take a recipient. A
 * company with another Hiworks address sets NEXT_PUBLIC_MAIL_COMPOSE_URL. */
export const DEFAULT_MAIL_COMPOSE_URL = "https://mails.office.hiworks.com/write?mode=normal";

export function mailComposeUrl(): string {
  const set = process.env.NEXT_PUBLIC_MAIL_COMPOSE_URL?.trim();
  return set && /^https:\/\//.test(set) ? set : DEFAULT_MAIL_COMPOSE_URL;
}

/** Copies text to the clipboard; false when the browser refuses (it needs a click and https). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
