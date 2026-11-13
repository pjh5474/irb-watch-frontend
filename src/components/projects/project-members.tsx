"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorText } from "@/components/pipelines/shared";
import { sharingKey, useProjectAccess } from "@/components/projects/project-access";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { projectApi } from "@/lib/api/projects";
import { useSingleFlight } from "@/lib/use-single-flight";

/**
 * Who works on the project (phase B1): the owner, the PM and the members, all from the
 * project's organization. The owner, the PM and organization admins add and remove members;
 * the owner and organization admins set the PM and hand the project over; a member may leave.
 */
export function ProjectMembers({ projectId }: { projectId: number }) {
  const t = useTranslations("sharing");
  const tp = useTranslations("pipelines");
  const queryClient = useQueryClient();
  const router = useRouter();
  const flight = useSingleFlight();
  const { sharing, loading } = useProjectAccess();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState("");
  const [handTo, setHandTo] = useState("");
  const [keep, setKeep] = useState(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const candidates = useQuery({
    queryKey: ["projects", "candidates", projectId],
    queryFn: () => projectApi.candidates(projectId),
    enabled: !!sharing?.can_manage_members,
  });

  async function run(work: () => Promise<unknown>, ok: string, after?: () => void) {
    setMessage(null);
    await flight.run(async () => {
      try {
        await work();
        setMessage({ kind: "ok", text: ok });
        await queryClient.invalidateQueries({ queryKey: sharingKey(projectId) });
        await queryClient.invalidateQueries({ queryKey: ["projects", "candidates", projectId] });
        after?.();
      } catch (e) {
        setMessage({ kind: "error", text: errorText(e, tp) });
      }
    });
  }

  if (loading) return <p className="text-sm opacity-70">{tp("loading")}</p>;
  if (!sharing) return <p role="alert" className="text-sm text-red-600">{t("loadError")}</p>;
  const pm = sharing.members.find((m) => m.role === "pm");
  const people = candidates.data ?? [];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col gap-1">
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{sharing.owner?.name ?? t("unknown")}</span>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{t("owner")}</span>
        </li>
        {sharing.members.map((m) => (
          <li key={m.user.id} className="flex flex-wrap items-center gap-2">
            <span className={m.in_organization ? "" : "line-through opacity-60"}>{m.user.name || t("unknown")}</span>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{t(m.role === "pm" ? "pm" : "member")}</span>
            {!m.in_organization && <span className="text-xs text-amber-700 dark:text-amber-300">{t("movedAway")}</span>}
            {sharing.can_manage_members && !(m.role === "pm" && !sharing.can_manage) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={flight.busy}
                onClick={() => void run(() => projectApi.removeMember(projectId, m.user.id), t("removed"))}
              >
                {t("remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sharing.members.length === 0 && <p className="opacity-70">{t("notShared")}</p>}

      {sharing.can_manage_members && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            {t("add")}
            <select className="rounded border px-2 py-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{t("choosePerson")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            disabled={!adding || flight.busy}
            onClick={() => void run(() => projectApi.addMember(projectId, adding), t("added"), () => setAdding(""))}
          >
            {t("addButton")}
          </Button>
          {candidates.isSuccess && people.length === 0 && <span className="text-xs opacity-70">{t("noCandidates")}</span>}
        </div>
      )}

      {sharing.can_manage && (
        <label className="flex flex-wrap items-center gap-2">
          {t("pmLabel")}
          <select
            className="rounded border px-2 py-1"
            value={pm?.user.id ?? ""}
            disabled={flight.busy}
            onChange={(e) => void run(() => projectApi.setPm(projectId, e.target.value || null), t("pmSet"))}
          >
            <option value="">{t("noPm")}</option>
            {sharing.members.filter((m) => m.in_organization).map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {sharing.can_manage && (
        <details className="rounded border p-2">
          <summary className="cursor-pointer">{t("handOver")}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs opacity-70">{t("handOverHint")}</p>
            <select className="rounded border px-2 py-1" value={handTo} onChange={(e) => setHandTo(e.target.value)}>
              <option value="">{t("choosePerson")}</option>
              {[...sharing.members.filter((m) => m.in_organization).map((m) => m.user), ...people].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              {t("keepOldOwner")}
            </label>
            <div>
              <Button
                size="sm"
                variant="destructive"
                disabled={!handTo || flight.busy}
                onClick={() =>
                  void run(() => projectApi.handOver(projectId, handTo, keep), t("handedOver"), () => {
                    setHandTo("");
                    router.refresh();
                  })
                }
              >
                {t("handOverButton")}
              </Button>
            </div>
          </div>
        </details>
      )}

      {sharing.is_member && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmLeave ? (
            <>
              <span>{t("confirmLeave")}</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={flight.busy}
                onClick={() => void run(() => projectApi.leave(projectId), t("left"), () => router.push("/projects"))}
              >
                {t("leave")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
                {tp("cancel")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(true)}>
              {t("leave")}
            </Button>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={message.kind === "error" ? "text-red-600" : "text-green-700 dark:text-green-400"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
