"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminErrorText } from "@/components/admin/error-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type BoardSyncGroup, type BoardSyncResult, adminApi } from "@/lib/api/admin";
import { useSingleFlight } from "@/lib/use-single-flight";

// Add the boards an R-BAY hospital has (IRB members, news, other, FAQ, ...) but the server does not
// read yet. Step 1 is a dry run (reads the menu, changes nothing); step 2 creates the sources.
// One hospital per click: every call is a real R-BAY login.
export function BoardSync({ hospitalId, onChanged }: { hospitalId: number; onChanged: () => Promise<void> }) {
  const t = useTranslations("admin");
  const flight = useSingleFlight();
  const [result, setResult] = useState<BoardSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function run(dryRun: boolean) {
    setError(null);
    setApplying(!dryRun);
    await flight.run(async () => {
      try {
        const r = await adminApi.syncRbayBoards(hospitalId, dryRun);
        setResult(r);
        if (!dryRun) await onChanged();
      } catch (e) {
        setError(adminErrorText(e, t));
      }
    });
  }

  const names = (g: BoardSyncGroup, codes: string[]) => codes.map((c) => g.menu[c] || c).join(", ");
  const total = result?.groups.reduce((n, g) => n + g.to_create.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={flight.busy} onClick={() => void run(true)}>
          {t("hospitals.sync.check")}
        </Button>
        {result?.dry_run && total > 0 && (
          <Button size="sm" disabled={flight.busy} onClick={() => void run(false)}>
            {t("hospitals.sync.apply", { n: total })}
          </Button>
        )}
        {result && (
          <Button size="sm" variant="ghost" disabled={flight.busy} onClick={() => setResult(null)}>
            {t("hospitals.sync.dismiss")}
          </Button>
        )}
        {flight.busy && (
          <span className="flex items-center gap-1 opacity-70">
            <Spinner aria-hidden />
            {applying ? t("hospitals.sync.applying") : t("hospitals.sync.checking")}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {result?.groups.map((g) => (
        <div key={`${g.agency}:${g.login_user}`} className="flex flex-col gap-0.5">
          {g.error ? (
            <p role="alert" className="text-red-600">
              {t("hospitals.sync.error", { login: g.login_user, reason: g.error })}
            </p>
          ) : (
            <>
              {result.dry_run && g.to_create.length === 0 && (
                <p>{t("hospitals.sync.nothing", { login: g.login_user })}</p>
              )}
              {result.dry_run && g.to_create.length > 0 && (
                <p>{t("hospitals.sync.toCreate", { login: g.login_user, boards: names(g, g.to_create) })}</p>
              )}
              {!result.dry_run && g.created.length > 0 && (
                <p className="text-green-700 dark:text-green-400">
                  {t("hospitals.sync.created", { login: g.login_user, boards: g.created.map((s) => s.name).join(", ") })}
                </p>
              )}
              {Object.entries(g.failed).map(([code, reason]) => (
                <p key={code} role="alert" className="text-red-600">
                  {t("hospitals.sync.failed", { board: g.menu[code] || code, reason })}
                </p>
              ))}
              {g.not_in_menu.length > 0 && <p className="opacity-70">{t("hospitals.sync.missing", { boards: g.not_in_menu.join(", ") })}</p>}
              {g.unknown.length > 0 && <p className="opacity-70">{t("hospitals.sync.unknown", { boards: names(g, g.unknown) })}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
