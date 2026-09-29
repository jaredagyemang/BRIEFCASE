"use client";

import { useState, useTransition } from "react";
import { completeTutorialAction } from "@/app/welcome/actions";
import { BrandLogo } from "@/components/brand-logo";
import { TUTORIAL_STEPS } from "@/content/tutorial";

// The welcome tutorial, one step at a time, with Skip and Next. Finishing or
// skipping records it, so it's only shown once.
export function Tutorial({ next }: { next: string }) {
  const [index, setIndex] = useState(0);
  const [finishing, startFinishing] = useTransition();
  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;
  const finish = () => startFinishing(() => completeTutorialAction(next));

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pt-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex justify-end">
        {!last && (
          <button type="button" onClick={finish} disabled={finishing} className="py-2 text-sm font-semibold text-muted">
            Skip
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center text-center" data-tutorial-step={index}>
        {index === 0 && <BrandLogo variant="full" className="mx-auto mb-8 w-40" />}
        <h1 className="text-3xl font-bold tracking-tight">{step.title}</h1>
        <p className="mt-3 text-muted">{step.body}</p>
      </div>
      {TUTORIAL_STEPS.length > 1 && (
        <div
          className="mb-6 flex justify-center gap-1.5"
          role="img"
          aria-label={`Step ${index + 1} of ${TUTORIAL_STEPS.length}`}
        >
          {TUTORIAL_STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-accent" : "w-1.5 bg-border"}`} />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => (last ? finish() : setIndex(index + 1))}
        disabled={finishing}
        className="w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-foreground disabled:opacity-60"
      >
        {finishing ? "One moment…" : last ? "Get started" : "Next"}
      </button>
    </div>
  );
}
