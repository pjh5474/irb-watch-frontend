"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { pipelineApi } from "@/lib/api/pipelines";
import { useSingleFlight } from "@/lib/use-single-flight";

// Pieces shared by the pipeline overview and the step page.

export type Message = { kind: "ok" | "error"; text: string } | null;
type T = ReturnType<typeof useTranslations>;

export const detailKey = (id: number) => ["pipelines", "detail", id] as const;
export const stepKey = (id: number, stepId: number) => ["pipelines", "step", id, stepId] as const;

export function errorText(e: unknown, t: T | ((key: string) => string)): string {
  if (e instanceof ApiError) return e.status === 0 ? t("unreachable") : e.message || t("failed");
  return t("failed");
}

export function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
    >
      {message.text}
    </p>
  );
}

/**
 * One change at a time with its own message; afterwards every pipeline query is loaded again
 * (the overview and the step pages), so both views agree.
 */
export function useChange() {
  const t = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [message, setMessage] = useState<Message>(null);
  async function run(work: () => Promise<unknown>, ok: string | null): Promise<boolean> {
    setMessage(null);
    const done = await flight.run(async () => {
      try {
        await work();
        if (ok) setMessage({ kind: "ok", text: ok });
        await queryClient.invalidateQueries({ queryKey: ["pipelines"] });
        return true;
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, t) });
        return false;
      }
    });
    return done ?? false;
  }
  return { run, busy: flight.busy, message, setMessage };
}

/** The history, collapsed until asked for: the whole pipeline's, or one step's. */
export function History({ id, stepId, stepNames }: { id: number; stepId?: number; stepNames?: Map<number, string> }) {
  const t = useTranslations("pipelines");
  const [open, setOpen] = useState(false);
  const events = useQuery({
    queryKey: ["pipelines", "history", id, stepId ?? "all"],
    queryFn: () => pipelineApi.history(id, stepId),
    enabled: open,
  });
  return (
    <section className="flex flex-col gap-2 rounded border p-4 text-sm">
      <div>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("hideHistory") : t(stepId === undefined ? "history" : "stepHistory")}
        </Button>
      </div>
      {open && events.isLoading && <p className="opacity-70">{t("loading")}</p>}
      {events.isError && (
        <p role="alert" className="text-red-600">
          {errorText(events.error, t)}
        </p>
      )}
      {open && events.data?.length === 0 && <p className="opacity-70">{t("noHistory")}</p>}
      {open && (
        <ol className="flex flex-col gap-1">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap gap-2">
              <time className="tabular-nums opacity-60" dateTime={e.created_at}>
                {e.created_at.slice(0, 16).replace("T", " ")}
              </time>
              <span>{t.has(`event.${eventKey(e.event_type)}`) ? t(`event.${eventKey(e.event_type)}`) : e.event_type}</span>
              {e.step_id !== null && stepNames?.has(e.step_id) && <span className="opacity-70">· {stepNames.get(e.step_id)}</span>}
              {typeof e.payload.name === "string" && <span className="opacity-70">· {e.payload.name}</span>}
              {!e.mine && <span className="opacity-60">· {t("byOther")}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Message keys cannot contain dots: "step.added" -> "step_added". */
function eventKey(eventType: string): string {
  return eventType.replace(/\./g, "_");
}
