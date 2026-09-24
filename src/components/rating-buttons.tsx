"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { TRAFFIC_LIGHTS, type TrafficLight } from "@/lib/players";
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
// a follow-up sheet; Red archives right away. Every rating can be undone,
// from the sheet (Green/Yellow) or the confirmation toast (Red).
export function RatingButtons({
  playerId,
  rating,
}: {
  playerId: string;
  rating: TrafficLight | null;
}) {
  const [optimisticRating, setOptimisticRating] = useOptimistic(rating);
  const [pending, startTransition] = useTransition();
  const [followUp, setFollowUp] = useState<FollowUp>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [receipt, setReceipt] = useState<RatingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    // Leave undoable toasts up longer so there's time to reach the button.
    const timeout = setTimeout(() => setToast(null), toast.undo ? 6000 : 2500);
    return () => clearTimeout(timeout);
  }, [toast]);

  function rate(next: TrafficLight) {
    setError(null);
    startTransition(async () => {
      setOptimisticRating(next);
      let result: RatingReceipt;
      try {
        result = await ratePlayer(playerId, next);
      } catch {
        setError("Couldn't save the rating. Check your connection and try again.");
        return;
      }
      if (next === "red") {
        setToast({ message: "Moved to Archived / Pass", undo: result });
      } else {
        setReceipt(result);
        setFollowUp(next);
      }
    });
  }

  function undo(toUndo: RatingReceipt) {
    setError(null);
    startTransition(async () => {
      try {
        await undoRating(playerId, toUndo);
      } catch {
        setError("Couldn't undo. Try again.");
        return;
      }
      setFollowUp(null);
      setReceipt(null);
      setToast({ message: "Rating undone" });
    });
  }

  function followUpAction(action: (() => Promise<void>) | null, message: string | null) {
    startTransition(async () => {
      try {
        if (action) await action();
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
        <FollowUpSheet onClose={() => setFollowUp(null)}>
          {followUp === "green" ? (
            <>
              <SheetTitle dot="bg-green" title="Rated Green" subtitle="Queue for Outreach?" />
              <SheetButton
                primary
                disabled={pending}
                onClick={() =>
                  followUpAction(() => queueForOutreach(playerId), "Queued for outreach")
                }
              >
                Queue for Outreach
              </SheetButton>
              <SheetButton disabled={pending} onClick={() => setFollowUp(null)}>
                Not now
              </SheetButton>
              {receipt && <UndoLink disabled={pending} onClick={() => undo(receipt)} />}
            </>
          ) : (
            <>
              <SheetTitle
                dot="bg-yellow"
                title="Rated Yellow"
                subtitle="Moved to Watch Again. What's next?"
              />
              <SheetButton
                primary
                disabled={pending}
                onClick={() =>
                  followUpAction(() => requestFilmAndInfo(playerId), "Film & info request saved")
                }
              >
                Request Film &amp; Info
              </SheetButton>
              <SheetButton disabled={pending} onClick={() => followUpAction(null, null)}>
                Watch Again
              </SheetButton>
              {receipt && <UndoLink disabled={pending} onClick={() => undo(receipt)} />}
            </>
          )}
        </FollowUpSheet>
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

function FollowUpSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md space-y-3 rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        {children}
      </div>
    </div>
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

function SheetTitle({ dot, title, subtitle }: { dot: string; title: string; subtitle: string }) {
  return (
    <div className="pb-2 text-center">
      <span className={`mx-auto mb-3 block h-10 w-10 rounded-full ${dot}`} />
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-muted">{subtitle}</p>
    </div>
  );
}

function SheetButton({
  primary,
  ...props
}: { primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-full rounded-2xl py-3.5 font-semibold transition disabled:opacity-60 ${
        primary ? "bg-accent text-accent-foreground" : "bg-surface-muted"
      }`}
      {...props}
    />
  );
}
