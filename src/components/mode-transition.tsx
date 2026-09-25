import { ViewTransition } from "react";
import type { ModeId } from "@/lib/modes";

// Wraps a mode's layout. Layouts stay mounted while moving around inside a
// mode, so this only animates when switching modes: the switcher tags those
// navigations "mode-forward" or "mode-back", which tells React to run a view
// transition. The slide itself is styled in globals.css by this fixed name
// (mode-events, …) plus the direction the switcher puts on <html>, not by
// view-transition classes: Safari doesn't reliably support those and falls
// back to a crossfade that shows both screens at once.
export function ModeTransition({ mode, children }: { mode: ModeId; children: React.ReactNode }) {
  const slide = { "mode-forward": "mode-forward", "mode-back": "mode-back", default: "none" };
  return (
    <ViewTransition name={`mode-${mode}`} enter={slide} exit={slide} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
