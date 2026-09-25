// The slide between modes (Profile · Events · The Docket), done by hand
// rather than with the browser's View Transitions: Safari's implementation
// snapshots screens in ways that could briefly show the old and new screens
// on top of each other. Here nothing is snapshotted; two ordinary elements
// just move side by side.
//
// 1. startModeSlide(), on tap: an exact, opaque copy of the current screen
//    (including where each part of it is scrolled to) is laid over it.
// 2. The new mode's page loads underneath, hidden by the copy.
// 3. finishModeSlide(), in a layout effect when the new page has been
//    committed and before it is painted: the copy slides out one side while
//    the new screen slides in from the other, then the copy is removed.

const DURATION = 420;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
// If the new page never arrives (a failed navigation), stop covering the
// real screen.
const GIVE_UP_AFTER = 15000;

type Slide = { cover: HTMLElement; direction: 1 | -1; from: string; giveUp: ReturnType<typeof setTimeout> };
let slide: Slide | null = null;

// A mode's screen is the scroll box its layout renders as <main>'s child.
function currentScreen(main: HTMLElement) {
  return [...main.children].find((el): el is HTMLElement => el instanceof HTMLElement && !el.dataset.modeCover);
}

// Scroll positions aren't part of a DOM copy, so carry them over, including
// sliders like Active Events / Previous Showcases.
function copyScrollPositions(from: Element, to: Element) {
  if (from.scrollTop || from.scrollLeft) {
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
  }
  const a = from.children;
  const b = to.children;
  for (let i = 0; i < a.length && i < b.length; i++) copyScrollPositions(a[i], b[i]);
}

function removeCover() {
  if (!slide) return;
  clearTimeout(slide.giveUp);
  slide.cover.remove();
  slide = null;
}

export function startModeSlide(direction: 1 | -1, from: string) {
  removeCover();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const main = document.querySelector("main");
  const screen = main && currentScreen(main);
  if (!main || !screen) return;

  const cover = screen.cloneNode(true) as HTMLElement;
  cover.dataset.modeCover = "true";
  cover.setAttribute("aria-hidden", "true");
  // Opaque, so the new page loading underneath never shows through.
  Object.assign(cover.style, { position: "absolute", inset: "0", zIndex: "1", background: "var(--background)" });
  // While the new page loads, the copy catches taps so nothing happens on the
  // hidden screen underneath, and its links (plain copies) go nowhere.
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  cover.addEventListener("click", swallow, true);
  cover.addEventListener("submit", swallow, true);
  for (const el of cover.querySelectorAll<HTMLElement>("a, button, input, textarea, select, [tabindex]")) el.tabIndex = -1;
  main.append(cover);
  copyScrollPositions(screen, cover);
  slide = { cover, direction, from, giveUp: setTimeout(removeCover, GIVE_UP_AFTER) };
}

// Call when the route has changed, before paint.
export function finishModeSlide(pathname: string) {
  if (!slide || slide.from === pathname) return;
  const { cover, direction } = slide;
  clearTimeout(slide.giveUp);
  slide = null;
  const main = cover.parentElement;
  const incoming = main && currentScreen(main);
  if (!incoming) {
    cover.remove();
    return;
  }
  const options = { duration: DURATION, easing: EASING };
  // Forward (to the right-hand compartment): the old screen leaves to the
  // left and the new one comes in from the right; back is the mirror image.
  incoming.animate([{ transform: `translateX(${direction * 100}%)` }, { transform: "translateX(0)" }], options);
  const out = cover.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${-direction * 100}%)` }],
    { ...options, fill: "forwards" },
  );
  out.finished.finally(() => cover.remove());
}
