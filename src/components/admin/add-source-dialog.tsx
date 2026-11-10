"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

/** The "add a source" form in a dialog, so the list of sources starts at the top of the page. */
export function AddSourceDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string) => void }) {
  const t = useTranslations("admin");
  const add = useSingleFlight();
  const [form, setForm] = useState({ name: "", url: "", login: "" });
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
        await adminApi.createSource({ name: form.name, url: form.url, login_user: form.login.trim() || null });
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
