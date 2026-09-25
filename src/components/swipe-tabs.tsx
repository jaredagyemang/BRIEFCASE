"use client";

import { Children, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type Tab = { id: string; label: string; count?: number };

// Horizontally swipeable sections with a segmented control on top. Swipe
// between panes on a phone, or tap a segment. The container takes the height
// of the visible pane so a short pane doesn't leave empty space.
export function SwipeTabs({
  tabs,
  initialTab,
  label,
  children,
}: {
  tabs: Tab[];
  initialTab?: string;
  label: string;
  children: React.ReactNode;
}) {
  const panes = Children.toArray(children);
  const baseId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(() => Math.max(0, tabs.findIndex((t) => t.id === initialTab)));
  const [height, setHeight] = useState<number>();

  const scrollTo = useCallback((index: number, behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ left: index * scroller.clientWidth, behavior });
  }, []);

  // Start on the requested tab without animating.
  useLayoutEffect(() => {
    scrollTo(active, "instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  // Follow swipes: whichever pane is mostly in view becomes active.
  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || !scroller.clientWidth) return;
    const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (index !== active && index >= 0 && index < tabs.length) setActive(index);
  }

  // Match the container's height to the active pane, including when its
  // content changes size.
  useEffect(() => {
    const pane = paneRefs.current[active];
    if (!pane) return;
    const update = () => setHeight(pane.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div>
      <div role="tablist" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-surface-muted p-1">
        {tabs.map((tab, i) => {
          const selected = i === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-pane-${tab.id}`}
              onClick={() => {
                setActive(i);
                scrollTo(i, "smooth");
              }}
              className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${
                selected ? "bg-foreground text-background shadow-sm" : "text-muted"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 ${selected ? "opacity-70" : "opacity-60"}`}>{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        style={{ height }}
        className="-mx-4 mt-3 flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden transition-[height] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {panes.map((pane, i) => (
          <div
            key={tabs[i]?.id ?? i}
            ref={(el) => {
              paneRefs.current[i] = el;
            }}
            role="tabpanel"
            id={`${baseId}-pane-${tabs[i]?.id}`}
            aria-labelledby={`${baseId}-tab-${tabs[i]?.id}`}
            aria-hidden={i !== active}
            className="w-full min-w-full shrink-0 snap-start snap-always px-4"
          >
            {pane}
          </div>
        ))}
      </div>
    </div>
  );
}
