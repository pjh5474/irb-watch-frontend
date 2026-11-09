"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/lib/api/admin";
import type { ActionCard } from "@/lib/api/agent";

export type ActionState = { status: "idle" | "running" | "done" | "error" | "dismissed"; message?: string };

/**
 * Runs a confirmed proposal through the normal admin route with the admin's own login. The
 * assistant never runs anything itself; the server re-checks the admin role on every call.
 */
export async function runAction(action: ActionCard): Promise<void> {
  switch (action.kind) {
    case "scan_source":
      if (action.source_id === undefined) throw new Error("no source");
      await adminApi.scanSource(action.source_id);
      return;
    case "scan_all":
      await adminApi.scanAll();
      return;
    case "resummarize":
      if (action.document_id === undefined) throw new Error("no document");
      await adminApi.resummarize(action.document_id);
      return;
    case "test_mail":
      await adminApi.sendTestMail();
      return;
    case "weekly_preview":
      await adminApi.sendWeeklyPreview();
      return;
  }
}

// What the proposal means, in words. The name comes from the server as plain text.
function Description({ action }: { action: ActionCard }) {
  const t = useTranslations("assistant.action");
  const name = action.name ?? "";
  switch (action.kind) {
    case "scan_source":
      return <>{t("scan_source", { name })}</>;
    case "resummarize":
      return <>{t("resummarize", { name })}</>;
    default:
      return <>{t(action.kind)}</>;
  }
}

// A proposal from the assistant. Clickable only in the live session (`interactive`); a card
// loaded from the history is plain text, because the server does not remember whether it was
// confirmed and a second click could repeat the action.
export function ActionCardView({
  action,
  interactive,
  state,
  onConfirm,
  onDismiss,
}: {
  action: ActionCard;
  interactive: boolean;
  state: ActionState;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("assistant.action");

  if (!interactive) {
    return (
      <p className="rounded border border-dashed px-3 py-2 text-xs opacity-70">
        {t("proposed")}: <Description action={action} />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-medium">
        <Description action={action} />
      </p>
      {action.kind === "resummarize" && <p className="text-xs opacity-80">{t("resummarizeWarning")}</p>}
      {state.status === "idle" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onConfirm}>
            {t("confirm")}
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss}>
            {t("dismiss")}
          </Button>
        </div>
      )}
      {state.status === "running" && (
        <p className="flex items-center gap-2 text-xs" role="status">
          <Spinner aria-hidden /> {t("running")}
        </p>
      )}
      {state.status === "done" && (
        <p role="status" className="text-xs text-green-800 dark:text-green-300">
          {t("done")}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {state.message}
        </p>
      )}
      {state.status === "dismissed" && <p className="text-xs opacity-70">{t("dismissed")}</p>}
    </div>
  );
}
