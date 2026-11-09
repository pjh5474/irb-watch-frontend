"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

// The user's own choice about the daily digest mail, stored in notification_prefs. Row-level
// security lets a user read their own row, create it and change `digest_enabled` only. A
// missing row means "on". The row is changed with update-then-insert, not upsert, because an
// upsert also writes user_id and the user may not update that column.
export function DigestToggle({ userId, initial }: { userId: string; initial: boolean }) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const flight = useSingleFlight();

  async function change(next: boolean) {
    setMessage(null);
    const previous = enabled;
    setEnabled(next); // shown at once; put back if saving fails
    await flight.run(async () => {
      try {
        const supabase = createClient();
        const updated = await supabase
          .from("notification_prefs")
          .update({ digest_enabled: next })
          .eq("user_id", userId)
          .select("user_id");
        if (updated.error) throw updated.error;
        if (!updated.data || updated.data.length === 0) {
          const inserted = await supabase
            .from("notification_prefs")
            .insert({ user_id: userId, digest_enabled: next });
          if (inserted.error) throw inserted.error;
        }
        setMessage({ kind: "ok", text: next ? t("digestOn") : t("digestOff") });
      } catch {
        setEnabled(previous);
        setMessage({ kind: "error", text: t("saveError") });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={enabled}
          disabled={flight.busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          <span className="font-medium">{t("digestLabel")}</span>
          <span className="block opacity-70">{t("digestHint")}</span>
        </span>
      </label>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
