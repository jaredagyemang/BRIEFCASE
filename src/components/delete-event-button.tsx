"use client";

import { useState, useTransition } from "react";
import { deleteEvent, previewEventDeletion, type EventDeletionPreview } from "@/app/events/actions";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Deletes an event after a confirmation prompt. "icon" is the compact trash
// button on event lists; "full" is the wide button on the edit page.
export function DeleteEventButton({
  eventId,
  eventName,
  variant = "icon",
}: {
  eventId: string;
  eventName: string;
  variant?: "icon" | "full";
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EventDeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function openSheet() {
    setOpen(true);
    setPreview(null);
    setError(null);
    previewEventDeletion(eventId).then(setPreview, () =>
      setError("Couldn’t check what’s in this event. You can still delete it."),
    );
  }

  function close() {
    if (!deleting) setOpen(false);
  }

  function confirm() {
    setError(null);
    startDelete(async () => {
      // From the edit page the event's own pages are gone, so go to Events.
      const result = await deleteEvent(eventId, variant === "full");
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  }

  const alsoElsewhere = preview ? preview.players - preview.onlyHere : 0;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openSheet}
          aria-label={`Delete ${eventName}`}
          className="shrink-0 px-4 py-4 text-muted transition-colors active:bg-surface-muted sm:hover:bg-surface-muted sm:hover:text-red"
        >
          <TrashIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="w-full rounded-2xl bg-red/10 py-3.5 font-semibold text-red"
        >
          Delete event
        </button>
      )}

      {open && (
        <Sheet onClose={close}>
          <SheetTitle
            title="Delete this event?"
            subtitle="This will permanently remove all players, ratings, and notes tied to this event and cannot be undone."
          />
          <div className="rounded-2xl bg-surface-muted p-4 text-sm">
            <p className="truncate font-semibold">{eventName}</p>
            {preview ? (
              <ul className="mt-1 space-y-1 text-muted">
                <li>
                  {plural(preview.players, "player")} ·{" "}
                  {preview.entries === 1 ? "1 rating or note" : `${preview.entries} ratings and notes`}
                </li>
                {alsoElsewhere > 0 && (
                  <li>
                    {alsoElsewhere === 1 ? "1 player is" : `${alsoElsewhere} players are`} also in other events and
                    will stay in Briefcase — only their ratings, notes and jersey number from this event are removed.
                  </li>
                )}
                {preview.onlyHere > 0 && (
                  <li>
                    {preview.onlyHere === 1 ? "1 player was" : `${preview.onlyHere} players were`} only seen at this
                    event and will be removed from Briefcase.
                  </li>
                )}
              </ul>
            ) : (
              !error && <p className="mt-1 text-muted">Checking what’s in this event…</p>
            )}
          </div>
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton variant="danger" disabled={deleting} onClick={confirm}>
            {deleting ? "Deleting…" : "Delete event"}
          </SheetButton>
          <SheetButton disabled={deleting} onClick={close}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
    </>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
