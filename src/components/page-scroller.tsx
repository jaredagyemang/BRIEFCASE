// A screen's own scrolling area, filling the space between the header and
// the bottom of the screen. Pages scroll inside this box instead of the whole
// document, so a screen is always exactly one screen tall however long its
// content is. That keeps the snapshot taken for the mode slide identical for
// every mode: just what's visible, never a huge or scroll-offset image.
export function PageScroller({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full scroll-pt-4 overflow-x-hidden overflow-y-auto overscroll-y-contain sm:scroll-pt-8">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-36 sm:pt-8">{children}</div>
    </div>
  );
}
