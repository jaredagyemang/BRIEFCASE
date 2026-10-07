"use client";

import { createContext, useContext, useState } from "react";
import { dismissHintAction } from "@/app/docket/actions";

// One-time hints in The Docket: each shows until the coach dismisses it (or,
// for the swipe hint, swipes), then never again, on any device.
type HintKey = "swipe" | "lists";
type Hints = { seen: Set<HintKey>; dismiss: (key: HintKey) => void };

const HintsContext = createContext<Hints>({ seen: new Set(["swipe", "lists"]), dismiss: () => {} });

export function HintsScope({ seen, children }: { seen: HintKey[]; children: React.ReactNode }) {
  const [done, setDone] = useState(() => new Set(seen));
  function dismiss(key: HintKey) {
    if (done.has(key)) return;
    setDone((prev) => new Set(prev).add(key));
    dismissHintAction(key).catch(() => {});
  }
  return <HintsContext.Provider value={{ seen: done, dismiss }}>{children}</HintsContext.Provider>;
}

export function useHint(key: HintKey) {
  const { seen, dismiss } = useContext(HintsContext);
  return { show: !seen.has(key), dismiss: () => dismiss(key) };
}

// The × on a hint.
export function DismissHint({ onClick, label = "Dismiss hint" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-muted"
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="m5 5 10 10M15 5 5 15" />
      </svg>
    </button>
  );
}
