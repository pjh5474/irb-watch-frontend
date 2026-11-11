"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

/** The "add a source" form in a dialog, so the list of sources starts at the top of the page.
 * Two kinds: a site that is scanned (its web address), or a manual source for a hospital with
 * no e-IRB site, whose documents an admin uploads by hand. */
export function AddSourceDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string) => void }) {
  const t = useTranslations("admin");
  const add = useSingleFlight();
  const [kind, setKind] = useState<"site" | "manual">("site");
  const [form, setForm] = useState({ name: "", url: "", login: "", membersOnly: false });
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    await add.run(async () => {
      try {
        if (kind === "manual") {
          await adminApi.createManualSource({ name: form.name, members_only: form.membersOnly });
        } else {
          await adminApi.createSource({ name: form.name, url: form.url, login_user: form.login.trim() || null });
        }
        onAdded(form.name);
      } catch (e) {
        setError(adminErrorText(e, t));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-source-title"
        className="mt-16 w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h2 id="add-source-title" className="text-lg font-medium">
            {t("addTitle")}
          </h2>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1">{t("sourceKind")}</legend>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={kind === "site"} onChange={() => setKind("site")} />
              <span>
                {t("kindSite")}
                <span className="block text-xs opacity-70">{t("kindSiteHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={kind === "manual"} onChange={() => setKind("manual")} />
              <span>
                {t("kindManual")}
                <span className="block text-xs opacity-70">{t("kindManualHint")}</span>
              </span>
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input
              ref={first}
              className="rounded border px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          {kind === "site" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                {t("url")}
                <input
                  className="rounded border px-3 py-2"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://hrpp.snuh.org/hrpp/bbs/list.do?key=2605277031"
                  required
                />
                <span className="text-xs opacity-70">{t("urlHint")}</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("loginLabel")}
                <input
                  className="rounded border px-3 py-2"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="study-1"
                  autoComplete="off"
                />
                <span className="text-xs opacity-70">{t("loginLabelHint")}</span>
              </label>
            </>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.membersOnly}
                onChange={(e) => setForm({ ...form, membersOnly: e.target.checked })}
              />
              <span>
                {t("manualMembersOnly")}
                <span className="block text-xs opacity-70">{t("manualMembersOnlyHint")}</span>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={add.busy} aria-busy={add.busy}>
              {add.busy && <Spinner aria-hidden />}
              {t("add")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
