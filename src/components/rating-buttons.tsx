"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { TRAFFIC_LIGHTS, type TrafficLight } from "@/lib/players";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import {
  queueForOutreach,
  ratePlayer,
  requestFilmAndInfo,
  undoRating,
  type RatingReceipt,
} from "@/app/players/actions";

type FollowUp = "green" | "yellow" | null;
type Toast = { message: string; undo?: RatingReceipt };

// Green / Yellow / Red rating row for a player profile. Green and Yellow open
// a follow-up sheet; Red archives right away. Ratings made during this visit
// can be undone one step at a time, from the sheet (Green/Yellow) or the
// toast (Red). Tapping the current color reopens its sheet/toast instead of
// saving a duplicate rating.
export function RatingButtons({
  eventId,
  playerId,
  rating,
}: {
  eventId: string;
  playerId: string;
  // This player's rating at this event.
  rating: TrafficLight | null;
}) {
  const [optimisticRating, setOptimisticRating] = useOptimistic(rating);
  const [pending, startTransition] = useTransition();
  const [followUp, setFollowUp] = useState<FollowUp>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Ratings made during this visit, newest last; Undo reverses the newest.
  const [history, setHistory] = useState<RatingReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latest = history.at(-1);
  // The newest rating from this visit, if it's for the given color.
  const undoableFor = (color: TrafficLight) => (latest?.rating === color ? latest : undefined);

  useEffect(() => {
    if (!toast) return;
    // Leave undoable toasts up longer so there's time to reach the button.
    const timeout = setTimeout(() => setToast(null), toast.undo ? 6000 : 2500);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Shows a color's follow-up again without saving anything.
  function reopen(color: TrafficLight, receipt?: RatingReceipt) {
    if (color === "red") setToast({ message: "Archived / Pass", undo: receipt });
    else setFollowUp(color);
  }

  function rate(next: TrafficLight) {
    setError(null);
    if (next === rating) {
      reopen(next, undoableFor(next));
      return;
    }
    startTransition(async () => {
      setOptimisticRating(next);
      let receipt: RatingReceipt | null;
      try {
        receipt = await ratePlayer(eventId, playerId, next);
      } catch {
        setError("Couldn't save the rating. Check your connection and try again.");
        return;
      }
      if (!receipt) {
        // Already had this rating (e.g. a double tap); nothing new was saved.
        reopen(next, undoableFor(next));
        return;
      }
      setHistory((h) => [...h, receipt]);
      if (next === "red") setToast({ message: "Moved to Archived / Pass", undo: receipt });
      else setFollowUp(next);
    });
  }

  function undo(receipt: RatingReceipt) {
    setError(null);
    startTransition(async () => {
      try {
        await undoRating(eventId, playerId, receipt);
      } catch {
        setError("Couldn't undo. Refresh the page and try again.");
        return;
      }
      setHistory((h) => h.filter((r) => r.evaluationId !== receipt.evaluationId));
      setFollowUp(null);
      setToast({ message: "Rating undone" });
    });
  }

  // Runs a follow-up and records what it changed so Undo can reverse it too.
  function followUpAction(kind: "outreach" | "film" | null, message: string | null) {
    const color: TrafficLight = kind === "outreach" ? "green" : "yellow";
    startTransition(async () => {
      try {
        if (kind) {
          const result =
            kind === "outreach"
              ? await queueForOutreach(eventId, playerId)
              : { status: undefined, ...(await requestFilmAndInfo(playerId)) };
          setHistory((h) =>
            h.map((r, i) =>
              i === h.length - 1 && r.rating === color
                ? {
                    ...r,
                    expectedStatus: result.status ?? r.expectedStatus,
                    taskIds: result.taskId ? [...r.taskIds, result.taskId] : r.taskIds,
                  }
                : r,
            ),
          );
        }
      } catch {
        setError("Couldn't save that. Try again.");
        return;
      }
      setFollowUp(null);
      if (message) setToast({ message });
    });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Rate player">
        {TRAFFIC_LIGHTS.map((light) => {
          const selected = optimisticRating === light.value;
          return (
            <button
              key={light.value}
              type="button"
              onClick={() => rate(light.value)}
              disabled={pending}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-2 rounded-2xl bg-surface py-4 text-sm font-semibold transition active:scale-95 disabled:opacity-70 ${
                selected ? `ring-2 ${light.ring}` : ""
              }`}
            >
              <span
                className={`h-9 w-9 rounded-full ${light.dot} transition ${
                  selected ? "scale-110 shadow-lg" : "opacity-50"
                }`}
              />
              {light.label}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 px-1 text-sm text-red">{error}</p>}

      {followUp && (
        <Sheet onClose={() => setFollowUp(null)}>
          {followUp === "green" ? (
            <>
              <SheetTitle icon={<RatingDot className="bg-green" />} title="Rated Green" subtitle="Queue for Outreach?" />
              <SheetButton
                variant="primary"
                disabled={pending}
                onClick={() =>
                  followUpAction("outreach", "Queued for outreach")
                }
              >
                Queue for Outreach
              </SheetButton>
              <SheetButton disabled={pending} onClick={() => setFollowUp(null)}>
                Not now
              </SheetButton>
              {undoableFor("green") && (
                <UndoLink disabled={pending} onClick={() => undo(undoableFor("green")!)} />
              )}
            </>
          ) : (
            <>
              <SheetTitle
                icon={<RatingDot className="bg-yellow" />}
                title="Rated Yellow"
                subtitle="Moved to Watch Again. What's next?"
              />
              <SheetButton
                variant="primary"
                disabled={pending}
                onClick={() =>
                  followUpAction("film", "Film & info request saved")
                }
              >
                Request Film &amp; Info
              </SheetButton>
              <SheetButton disabled={pending} onClick={() => followUpAction(null, null)}>
                Watch Again
              </SheetButton>
              {undoableFor("yellow") && (
                <UndoLink disabled={pending} onClick={() => undo(undoableFor("yellow")!)} />
              )}
            </>
          )}
        </Sheet>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-8"
        >
          <div className="flex items-center gap-4 rounded-full bg-foreground py-3 pr-3 pl-5 text-sm font-medium text-background shadow-lg">
            {toast.message}
            {toast.undo ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => toast.undo && undo(toast.undo)}
                className="rounded-full bg-background/20 px-4 py-1.5 font-semibold disabled:opacity-60"
              >
                Undo
              </button>
            ) : (
              <span className="pr-2" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function UndoLink({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 text-sm font-medium text-muted disabled:opacity-60"
    >
      Undo rating
    </button>
  );
}

function RatingDot({ className }: { className: string }) {
  return <span className={`mx-auto mb-3 block h-10 w-10 rounded-full ${className}`} />;
}
