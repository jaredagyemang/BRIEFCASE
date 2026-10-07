"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { completeTutorialAction } from "@/app/welcome/actions";
import logoDark from "@/assets/brand/logo-dark.png";
import { HelpIcon } from "@/components/page-help";
import { TUTORIAL_STEPS, type TutorialVisual } from "@/content/tutorial";

// The welcome tutorial, one idea per screen, gold on dark in both themes.
// Skip (any time) or finishing records it, so it's only shown once; Profile →
// Replay tutorial shows it again. Swiping sideways also moves between screens.
export function Tutorial({ next }: { next: string }) {
  const [index, setIndex] = useState(0);
  const [finishing, startFinishing] = useTransition();
  const step = TUTORIAL_STEPS[index];
  const total = TUTORIAL_STEPS.length;
  const last = index === total - 1;
  const finish = () => startFinishing(() => completeTutorialAction(next));
  const go = (to: number) => setIndex(Math.max(0, Math.min(total - 1, to)));

  // Sideways swipes between screens.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      className="scheme-dark h-full bg-background text-foreground"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-tutorial
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-accent-ink tabular-nums" data-tutorial-progress>
            {index + 1} of {total}
          </p>
          {!last && (
            <button
              type="button"
              onClick={finish}
              disabled={finishing}
              className="py-2 text-sm font-semibold text-muted"
            >
              Skip
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center" data-tutorial-step={index}>
          <Visual kind={step.visual} />
          <h1 className="mt-8 text-3xl leading-tight font-bold tracking-tight">{step.title}</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted">{step.body}</p>
        </div>

        <div className="mb-6 flex justify-center gap-1.5" role="img" aria-label={`Step ${index + 1} of ${total}`}>
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-accent" : i < index ? "w-1.5 bg-accent/60" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={finishing}
              className="rounded-2xl bg-surface-muted px-6 py-4 text-lg font-semibold"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : go(index + 1))}
            disabled={finishing}
            className="flex-1 rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-foreground disabled:opacity-60"
          >
            {finishing ? "One moment…" : last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A small picture for each screen.
function Visual({ kind }: { kind: TutorialVisual }) {
  if (kind === "welcome") {
    return <Image src={logoDark} alt="BRIEFCASE — Soccer Recruiting" priority className="h-auto w-48" />;
  }
  const tile = "flex h-40 w-40 items-center justify-center rounded-[2rem] bg-surface ring-1 ring-accent/30";
  if (kind === "events") {
    return (
      <div className={tile} aria-hidden>
        <div className="w-28 space-y-2">
          {["bg-green", "bg-yellow", "bg-accent"].map((dot, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-muted px-2 py-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
              <span className="h-1.5 flex-1 rounded-full bg-border" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "docket") {
    return (
      <div className={tile} aria-hidden>
        <div className="relative h-28 w-20 rounded-xl bg-black ring-1 ring-accent/50">
          <span className="absolute top-3 left-2 rounded-full bg-accent px-1.5 text-[0.6rem] font-bold text-accent-foreground">
            Info
          </span>
          <span className="absolute top-8 left-2 h-1.5 w-12 rounded-full bg-foreground/80" />
          <span className="absolute top-12 left-2 h-1 w-10 rounded-full bg-foreground/40" />
          <span className="absolute top-15 left-2 h-1 w-8 rounded-full bg-foreground/40" />
          <span className="absolute right-2 bottom-3 left-2 h-5 rounded-md bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (kind === "swipes") {
    return (
      <div className={tile} aria-hidden>
        <svg
          viewBox="0 0 120 120"
          className="h-32 w-32 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            x="40"
            y="30"
            width="40"
            height="60"
            rx="8"
            strokeWidth="4"
            className="text-foreground/70"
            stroke="currentColor"
          />
          <path d="M28 60H8m0 0 8-8m-8 8 8 8M92 60h20m0 0-8-8m8 8-8 8" />
          <path
            d="M60 22V4m0 0-8 8m8-8 8 8M60 98v18m0 0-8-8m8 8 8-8"
            className="text-foreground/50"
            stroke="currentColor"
          />
        </svg>
      </div>
    );
  }
  if (kind === "replies") {
    return (
      <div className={`${tile} flex-col gap-2`} aria-hidden>
        <div className="grid w-32 grid-cols-2 gap-1.5 text-[0.6rem] font-semibold">
          {["Let’s Connect", "Not interested", "Wrong position", "Wrong grad year"].map((t) => (
            <span key={t} className="rounded-lg bg-surface-muted px-1 py-1.5 leading-tight">
              {t}
            </span>
          ))}
          <span className="rounded-lg bg-surface-muted py-1.5">Skip</span>
          <span className="rounded-lg bg-surface-muted py-1.5 text-red">Delete</span>
        </div>
      </div>
    );
  }
  if (kind === "help") {
    return (
      <div className={tile} aria-hidden>
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-case text-accent ring-1 ring-accent/40">
          <HelpIcon className="h-11 w-11" />
        </span>
      </div>
    );
  }
  return (
    <div className={`${tile} flex-col gap-3`} aria-hidden>
      <span className="w-32 rounded-xl bg-accent py-2 text-sm font-semibold text-accent-foreground">★ Shortlisted</span>
      <span className="w-32 rounded-xl bg-surface-muted py-2 text-sm font-semibold">↗ Share to team</span>
    </div>
  );
}
