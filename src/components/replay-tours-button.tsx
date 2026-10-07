"use client";

import { useState, useTransition } from "react";
import { resetToursAction } from "@/app/tour-actions";

// Profile → Replay page tours: every page's tour shows again the next time
// that page is opened.
export function ReplayToursButton() {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 text-center">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            try {
              await resetToursAction();
              setDone(true);
            } catch {
              setFailed(true);
            }
          })
        }
        className="px-2 py-2.5 text-sm font-semibold text-accent-ink disabled:opacity-60"
        data-replay-tours
      >
        Replay page tours
      </button>
      {done && (
        <p role="status" className="mt-1 text-xs text-muted">
          Done. Each page’s tour will show the next time you open it.
        </p>
      )}
      {failed && (
        <p role="status" className="mt-1 text-xs text-red">
          Couldn’t reset the tours. Try again.
        </p>
      )}
    </div>
  );
}
