"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeenAction } from "@/app/tour-actions";
import { Sheet, SheetButton } from "@/components/sheet";
import { TOURS, type TourKey, type TourStep } from "@/content/tours";

// Page tours and the "?" help button. Each main page has a short spotlight
// tour that runs by itself the first time a coach opens it (once per coach,
// remembered in their login's settings), and a briefcase-with-a-question-mark
// button by its title that replays the tour and explains things in more
// detail. Tours only point at things on screen (steps whose element is
// missing are left out). These pages are only reachable after the Privacy
// Policy, Terms and welcome tutorial, so a tour never comes before them.

const ToursContext = createContext<TourKey[]>([...([] as TourKey[])]);

export function ToursScope({ seen, children }: { seen: TourKey[]; children: React.ReactNode }) {
  return <ToursContext.Provider value={seen}>{children}</ToursContext.Provider>;
}

// The element a step points at: the one on screen when there are several
// (e.g. one Info card per player in the feed).
function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const onScreen = all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
  return onScreen ?? all[0] ?? null;
}

export function PageHelp({ tour, className = "" }: { tour: TourKey; className?: string }) {
  const help = TOURS[tour];
  const seen = useContext(ToursContext);
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [open, setOpen] = useState(false);

  const start = useCallback(() => {
    const available = help.steps.filter((s) => findTarget(s.target));
    if (available.length) setSteps(available);
    return available.length > 0;
  }, [help.steps]);

  // First visit: wait for the page to settle (and for the first thing the
  // tour points at, e.g. the first Info card), then run the tour once.
  const started = useRef(false);
  useEffect(() => {
    if (seen.includes(tour) || started.current) return;
    const begun = Date.now();
    const timer = setInterval(() => {
      const ready = findTarget(help.steps[0].target) || Date.now() - begun > 4000;
      const busy = document.querySelector('[role="dialog"]');
      if (!ready || busy) {
        if (Date.now() - begun > 15000) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      setTimeout(() => {
        if (started.current) return;
        started.current = true;
        if (start()) markTourSeenAction(tour).catch(() => {});
      }, 600);
    }, 300);
    return () => clearInterval(timer);
  }, [seen, tour, help.steps, start]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Help: ${help.title}`}
        className={`pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-case text-accent shadow-sm ring-1 ring-accent/40 ${className}`}
        data-help-button
      >
        <HelpIcon className="h-6 w-6" />
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div className="pb-1 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-case text-accent">
              <HelpIcon />
            </div>
            <p className="mt-2 text-lg font-semibold">{help.title}</p>
          </div>
          <dl className="max-h-[50dvh] space-y-3 overflow-y-auto px-1" data-help-details>
            {help.details.map((d) => (
              <div key={d.term}>
                <dt className="font-semibold">{d.term}</dt>
                <dd className="text-sm text-muted">{d.text}</dd>
              </div>
            ))}
          </dl>
          <SheetButton
            variant="primary"
            onClick={() => {
              setOpen(false);
              // After the sheet has gone.
              setTimeout(start, 250);
            }}
          >
            Show me around
          </SheetButton>
          <SheetButton onClick={() => setOpen(false)}>Close</SheetButton>
        </Sheet>
      )}
      {steps && <Spotlight steps={steps} onDone={() => setSteps(null)} />}
    </>
  );
}

// One step at a time: the thing it's about, lit up, with a one-line
// explanation, Next and Skip.
function Spotlight({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useLayoutEffect(() => {
    const el = findTarget(step.target);
    if (!el) {
      // Gone since the tour started (e.g. the page changed): move on.
      const t = setTimeout(() => (last ? onDone() : setIndex((i) => i + 1)), 0);
      return () => clearTimeout(t);
    }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target, last, onDone]);

  if (typeof document === "undefined" || !rect) return null;
  const pad = 6;
  const box = {
    top: Math.max(4, rect.top - pad),
    left: Math.max(4, rect.left - pad),
    width: Math.min(rect.width + pad * 2, window.innerWidth - 8),
    height: rect.height + pad * 2,
  };
  // The explanation goes below the highlight if it fits, else above, else
  // at the bottom of the screen (for something taller than the screen).
  const card = 170;
  const below = box.top + box.height + 12;
  const position =
    below + card < window.innerHeight
      ? { top: below }
      : box.top - 12 - card > 0
        ? { bottom: window.innerHeight - box.top + 12 }
        : { bottom: 24 };

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Page tour" data-tour-overlay>
      {/* Taps outside the card do nothing, so the tour isn't lost by accident. */}
      <div className="absolute inset-0" />
      <div
        className="pointer-events-none absolute rounded-2xl ring-2 ring-accent transition-all duration-200"
        style={{ ...box, boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)" }}
      />
      <div
        className="scheme-dark absolute inset-x-4 mx-auto max-w-sm rounded-2xl bg-background p-4 text-foreground shadow-2xl ring-1 ring-accent/50"
        style={position}
        data-tour-step={step.target}
      >
        <p className="text-base leading-snug">{step.text}</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-semibold text-accent-ink tabular-nums">
            {index + 1} of {steps.length}
          </span>
          {!last && (
            <button type="button" onClick={onDone} className="ml-auto py-2 text-sm font-semibold text-muted">
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onDone() : setIndex(index + 1))}
            className={`${last ? "ml-auto" : ""} rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground`}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A briefcase with a question mark.
export function HelpIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
      <rect x="3" y="6.5" width="18" height="13.5" rx="2.5" />
      <path d="M10.3 11.2a1.8 1.8 0 1 1 2.5 1.65c-.5.22-.8.6-.8 1.15v.4" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
