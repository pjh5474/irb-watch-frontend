"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { HOSPITALS_KEY } from "@/components/admin/hospital-admin";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

/** The "add a source" form in a dialog, so the list of sources starts at the top of the page.
 * Two kinds: a site that is scanned (its web address), or a manual source for a hospital with
 * no e-IRB site, whose documents an admin uploads by hand. */
export function AddSourceDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string) => void }) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const add = useSingleFlight();
  const [kind, setKind] = useState<"site" | "manual">("site");
  const [form, setForm] = useState({ name: "", url: "", login: "", membersOnly: false, hospital: "" });
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  // "" = automatic: the hospital of another board on the same site, else one named like the board.
  const hospitals = useQuery({ queryKey: HOSPITALS_KEY, queryFn: adminApi.hospitals });
  const hospitalId = form.hospital ? Number(form.hospital) : null;

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
    // Hospital names are shown to every user: a members-only source never becomes one by itself.
    if (kind === "manual" && form.membersOnly && hospitalId === null) {
      setError(t("hospitals.needForMembersOnly"));
      return;
    }
    await add.run(async () => {
      try {
        if (kind === "manual") {
          await adminApi.createManualSource({ name: form.name, members_only: form.membersOnly, hospital_id: hospitalId });
        } else {
          await adminApi.createSource({
            name: form.name,
            url: form.url,
            login_user: form.login.trim() || null,
            hospital_id: hospitalId,
          });
        }
        await queryClient.invalidateQueries({ queryKey: HOSPITALS_KEY });
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
          <label className="flex flex-col gap-1 text-sm">
            {t("hospitals.moveTo")}
            <select
              className="rounded border px-2 py-1.5"
              value={form.hospital}
              onChange={(e) => setForm({ ...form, hospital: e.target.value })}
            >
              <option value="">{t("hospitals.automatic")}</option>
              {[...(hospitals.data?.hospitals ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
            <span className="text-xs opacity-70">{t("hospitals.automaticHint")}</span>
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
