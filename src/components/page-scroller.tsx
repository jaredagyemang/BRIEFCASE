// A screen's own scrolling area, filling the space between the header and
// the bottom of the screen. Pages scroll inside this box instead of the whole
// document, so each mode's screen is one screen-sized element that the mode
// switcher can copy and slide (see lib/mode-slide.ts). The padding keeps
// content clear of the bottom nav and the screen's rounded corners/notch.
// Signed-out screens have no header above them, so they keep clear of the
// status bar themselves (signedOut).
export function PageScroller({ children, signedOut = false }: { children: React.ReactNode; signedOut?: boolean }) {
  return (
    <div className="h-full scroll-pt-4 overflow-x-hidden overflow-y-auto overscroll-y-contain sm:scroll-pt-8">
      <div
        className={`mx-auto w-full max-w-3xl pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(9rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] ${
          signedOut ? "pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-[calc(2rem+env(safe-area-inset-top))]" : "pt-4 sm:pt-8"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
