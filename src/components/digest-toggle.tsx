"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSingleFlight } from "@/lib/use-single-flight";

type Message = { kind: "ok" | "error"; text: string } | null;

// The user's own choices about the daily mail, stored in notification_prefs: the document news
// (`digest_enabled`) and the IRB step reminders (`step_reminders_enabled`). Row-level security
// lets a user read their own row, create it and change those two columns only. A missing row
// means both are on. The row is changed with update-then-insert, not upsert, because an upsert
// also writes user_id and the user may not update that column.
const valuesOf = (part: keyof typeof PARTS, on: boolean) =>
  part === "digest" ? { digest_enabled: on } : { step_reminders_enabled: on };

const PARTS = {
  digest: { column: "digest_enabled", label: "digestLabel", hint: "digestHint", on: "digestOn", off: "digestOff" },
  reminders: {
    column: "step_reminders_enabled",
    label: "remindersLabel",
    hint: "remindersHint",
    on: "remindersOn",
    off: "remindersOff",
  },
} as const;

export function DigestToggle({
  userId,
  initial,
  part = "digest",
}: {
  userId: string;
  initial: boolean;
  part?: keyof typeof PARTS;
}) {
  const t = useTranslations("settings");
  const p = PARTS[part];
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
          .update(valuesOf(part, next))
          .eq("user_id", userId)
          .select("user_id");
        if (updated.error) throw updated.error;
        if (!updated.data || updated.data.length === 0) {
          const inserted = await supabase
            .from("notification_prefs")
            .insert({ user_id: userId, ...valuesOf(part, next) });
          if (inserted.error) throw inserted.error;
        }
        setMessage({ kind: "ok", text: next ? t(p.on) : t(p.off) });
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
          <span className="font-medium">{t(p.label)}</span>
          <span className="block opacity-70">{t(p.hint)}</span>
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
