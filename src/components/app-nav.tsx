"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { MODES, modeIndexFor } from "@/lib/modes";
import { finishModeSlide, startModeSlide } from "@/lib/mode-slide";

const LAST = MODES.length - 1;
const clamp = (i: number) => Math.min(LAST, Math.max(0, i));

// Each compartment remembers where you were, so flipping back to Events
// returns to the same event or player.
const storageKey = (index: number) => `briefcase:mode:${MODES[index].id}`;

function remember(index: number) {
  try {
    // Not one-off parameters: a player's "?tab=" (returning should land on the
    // first tab) or a result message like The Docket's "?gmail=connected".
    const params = new URLSearchParams(location.search);
    params.delete("tab");
    params.delete("gmail");
    const search = params.size ? `?${params}` : "";
    sessionStorage.setItem(storageKey(index), location.pathname + search);
  } catch {}
}

function destination(index: number) {
  const { root } = MODES[index];
  try {
    const saved = sessionStorage.getItem(storageKey(index));
    if (saved && (saved === root || saved.startsWith(root + "/") || saved.startsWith(root + "?"))) return saved;
  } catch {}
  return root;
}

// Where each compartment's link points: its remembered page (read after
// hydration; the server renders the plain roots).
const ROOTS = MODES.map((m) => m.root).join("\n");
const readDestinations = () => MODES.map((_, i) => destination(i)).join("\n");
const subscribeNoop = () => () => {};

// Top-level navigation: the three compartments of the briefcase (Profile,
// Events, The Docket) on a stitched leather rail. A cream divider card sits in
// the open compartment; tap a compartment, or drag the card along the rail, to
// flip to another one. Swiping elsewhere on the page doesn't switch modes:
// sideways swipes belong to the screens themselves (e.g. The Docket).
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const current = modeIndexFor(pathname);
  // Re-read on every render: remember() runs just before each switch.
  const hrefs = useSyncExternalStore(subscribeNoop, readDestinations, () => ROOTS).split("\n");

  // Links are fully prefetched so a switch starts sliding right away. The
  // prefetched copy can be a few minutes old, so refresh once on arrival.
  const arrivedFrom = useRef(current);
  useEffect(() => {
    if (arrivedFrom.current === current) return;
    arrivedFrom.current = current;
    // After the slide (420ms), so nothing on the incoming screen changes mid-slide.
    const timer = setTimeout(() => router.refresh(), 600);
    return () => clearTimeout(timer);
  }, [current, router]);

  // Move the divider as soon as it's tapped, before the new page arrives.
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null);
  const shown = pending && pending.from === pathname ? pending.index : current;

  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; step: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ dx: number; step: number } | null>(null);

  function go(target: number) {
    if (target === current) {
      // Tapping the open compartment goes back to its front page.
      if (pathname !== MODES[target].root) router.push(MODES[target].root);
      return;
    }
    remember(current);
    setPending({ index: target, from: pathname });
    if ("vibrate" in navigator) navigator.vibrate(8);
    startModeSlide(target > current ? 1 : -1, pathname);
    router.push(destination(target));
  }

  // The new mode's page has been committed: slide it in before it's painted.
  useLayoutEffect(() => {
    finishModeSlide(pathname);
  }, [pathname]);

  if (pathname.startsWith("/login")) return null;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (e.button !== 0 || !railRef.current) return;
    // One compartment's width: the rail minus its padding, in thirds.
    dragRef.current = { startX: e.clientX, step: (railRef.current.clientWidth - 12) / MODES.length, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // The card follows the finger, with a little give past either end.
    const min = -shown * d.step - 10;
    const max = (LAST - shown) * d.step + 10;
    setDrag({ dx: Math.min(max, Math.max(min, dx)), step: d.step });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    setDrag(null);
    const dx = e.clientX - d.startX;
    let steps = Math.round(dx / d.step);
    if (steps === 0 && Math.abs(dx) > d.step * 0.25) steps = Math.sign(dx);
    const target = clamp(shown + steps);
    if (target !== shown) go(target);
  }

  function onPointerCancel() {
    dragRef.current = null;
    setDrag(null);
  }

  const highlighted = drag === null ? shown : clamp(Math.round(shown + drag.dx / drag.step));

  return (
    <>
      <header
        className="z-20 flex-none border-b border-border bg-background"
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            💼 Briefcase
          </Link>
          <span className="text-sm font-medium text-muted">{MODES[shown].caption}</span>
        </div>
      </header>

      <nav
        aria-label="Modes"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <div className="pointer-events-auto relative mx-auto max-w-md pt-4">
          {/* The case handle, riveted in brass */}
          <div aria-hidden className="pointer-events-none absolute top-0 left-1/2 z-10 h-6 w-24 -translate-x-1/2">
            <div className="h-full rounded-t-full border-[5px] border-b-0 border-case" />
            <div className="absolute bottom-0 -left-1 h-2 w-3.5 rounded-sm bg-accent" />
            <div className="absolute -right-1 bottom-0 h-2 w-3.5 rounded-sm bg-accent" />
          </div>

          <div
            ref={railRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClickCapture={(e) => {
              if (!suppressClick.current) return;
              suppressClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }}
            className="relative touch-none rounded-[22px] bg-case p-1.5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.45)] select-none"
          >
            {/* Stitching */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[4px] rounded-[18px] border border-dashed border-case-stitch"
            />

            {/* The divider card, with a folder tab on top */}
            <div
              aria-hidden
              className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] rounded-2xl bg-divider shadow-[0_2px_8px_rgb(0_0_0/0.25)]"
              style={{
                transform: `translateX(calc(${shown * 100}% + ${drag?.dx ?? 0}px))`,
                transition: drag === null ? "transform 460ms cubic-bezier(0.34, 1.36, 0.5, 1)" : "none",
              }}
            >
              <div className="absolute -top-1 left-1/2 h-1.5 w-9 -translate-x-1/2 rounded-t-md bg-divider" />
            </div>

            <div className="relative grid grid-cols-3">
              {MODES.map((mode, i) => (
                <Link
                  key={mode.id}
                  href={i === current ? mode.root : hrefs[i]}
                  prefetch={i === current ? null : true}
                  draggable={false}
                  aria-current={i === current ? "page" : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    go(i);
                  }}
                  className={`flex flex-col items-center rounded-2xl py-2.5 transition-colors duration-300 ${
                    i === highlighted ? "text-divider-foreground" : "text-case-text"
                  }`}
                >
                  <span className="text-[15px] leading-tight font-semibold">{mode.label}</span>
                  <span
                    className={`mt-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors duration-300 ${
                      i === highlighted ? "text-divider-accent" : "text-accent"
                    }`}
                  >
                    {mode.caption}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
