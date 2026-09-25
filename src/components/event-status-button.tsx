"use client";

import { useTransition } from "react";
import { setEventStatus } from "@/app/events/actions";
import type { EventStatus } from "@/lib/events";

// Close an active event (moves it to Previous Showcases) or reopen a closed one.
export function EventStatusButton({ eventId, status }: { eventId: string; status: EventStatus }) {
  const [pending, startTransition] = useTransition();
  const closing = status === "active";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setEventStatus(eventId, closing ? "closed" : "active"))}
      className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? "Saving…" : closing ? "Close event" : "Reopen event"}
    </button>
  );
}
