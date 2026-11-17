"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { copyText, emailParts, mailComposeUrl } from "@/lib/email-links";

/** Plain text in which each real email address is a link: a click copies the address and opens the
 * company's web mail (Hiworks) in a new tab, where the user pastes it into the recipient. Other
 * text stays text. The link is a real anchor, so a middle-click or ctrl-click still works. */
export function EmailText({ text }: { text: string }) {
  const t = useTranslations("hospitalPage.contacts");
  const [done, setDone] = useState<{ address: string; ok: boolean } | null>(null);

  async function copy(address: string) {
    setDone({ address, ok: await copyText(address) });
  }

  return (
    <>
      {emailParts(text).map((part, i) =>
        part.kind === "email" ? (
          <span key={i}>
            <a
              href={mailComposeUrl()}
              target="_blank"
              rel="noopener noreferrer"
              title={t("emailLinkTitle")}
              className="underline underline-offset-2"
              onClick={() => void copy(part.text)}
            >
              {part.text}
            </a>
            {done?.address === part.text && (
              <span role="status" className="ml-1 text-xs opacity-70">
                ({done.ok ? t("emailCopied") : t("emailCopyFailed")})
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
