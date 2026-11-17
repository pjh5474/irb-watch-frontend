import { emailParts, mailtoHref } from "@/lib/email-links";

/** Plain text in which each real email address is a `mailto:` link (opens in a new tab, so the app
 * stays open when the browser's mail handler is a web mail such as Hiworks). Other text stays text. */
export function EmailText({ text }: { text: string }) {
  return (
    <>
      {emailParts(text).map((part, i) =>
        part.kind === "email" ? (
          <a
            key={i}
            href={mailtoHref(part.text)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
