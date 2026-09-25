"use client";

import { useOptimistic, useTransition } from "react";
import { LIFECYCLE_STATUSES, statusMeta, type LifecycleStatus } from "@/lib/players";
import { updatePlayerStatus } from "@/app/players/actions";

// Lifecycle status dropdown styled as a colored pill. Saves on change.
export function StatusSelect({
  eventId,
  playerId,
  status,
}: {
  eventId: string;
  playerId: string;
  status: LifecycleStatus;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative inline-flex">
      <select
        aria-label="Lifecycle status"
        value={optimisticStatus}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as LifecycleStatus;
          startTransition(async () => {
            setOptimisticStatus(next);
            await updatePlayerStatus(eventId, playerId, next);
          });
        }}
        className={`appearance-none rounded-full py-2 pr-9 pl-4 text-sm font-semibold outline-none focus:ring-4 focus:ring-accent/20 ${statusMeta(optimisticStatus).pill}`}
      >
        {LIFECYCLE_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs opacity-70">
        ▾
      </span>
    </div>
  );
}
