/**
 * Splits a contact text into plain parts and real email addresses, so only a valid address becomes
 * a `mailto:` link and everything else stays plain text. Hospitals write anything in these fields
 * ("_", "DRB", "(평일 08:30 ~ 17:30)", two addresses with a slash), so the text is never linked as
 * a whole. The pattern is strict on purpose: the address goes into an href, and it can hold no
 * space, quote, angle bracket, "?" or "&", so nothing can add a subject, a copy or markup.
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

export function mailtoHref(address: string): string {
  return `mailto:${address}`;
}
