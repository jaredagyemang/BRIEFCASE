import { ViewTransition } from "react";

// Wraps a mode's layout. Layouts stay mounted while moving around inside a
// mode, so this only animates when switching modes: the switcher tags those
// navigations "mode-forward" (to the right) or "mode-back" (to the left).
export function ModeTransition({ children }: { children: React.ReactNode }) {
  const slide = { "mode-forward": "mode-forward", "mode-back": "mode-back", default: "none" };
  return (
    <ViewTransition enter={slide} exit={slide} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
