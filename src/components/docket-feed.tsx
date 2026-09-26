"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { disconnectGmail } from "@/app/docket/actions";
import { PageScroller } from "@/components/page-scroller";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { clearGmailLinksCache, useGmailLinks } from "@/components/use-gmail-links";
import { toFeedItems, type FeedItem } from "@/lib/gmail/feed";
import { PLATFORM_LABEL, googleDocPreview, youtubeVideo } from "@/lib/gmail/links";

// The Docket's video feed: every YouTube, Hudl, Veo and Google Doc link from
// the coach's recent email, one per screen. Swipe up/down (or use the arrow
// keys) to move between them.
export function DocketFeed({ connectedEmail, notice }: { connectedEmail: string; notice?: string }) {
  const { result, loading, reload } = useGmailLinks(connectedEmail);
  const items = useMemo(() => (result?.status === "ok" ? toFeedItems(result.emails) : []), [result]);

  if (!result) {
    return (
      <FeedShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70" aria-busy="true">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <p className="text-sm">Reading your recent email…</p>
        </div>
      </FeedShell>
    );
  }

  if (result.status !== "ok") {
    const expired = result.status === "expired" || result.status === "not_connected";
    return (
      <StatePage connectedEmail={connectedEmail} onRefresh={reload} loading={loading}>
        <p className="font-semibold">{expired ? "Gmail needs reconnecting" : "Couldn’t read Gmail"}</p>
        <p className="mt-1 text-sm text-muted">
          {expired
            ? "Google stopped accepting this connection (it expired or access was removed). Connect again to keep reading links."
            : result.message}
        </p>
        {expired ? (
          <a
            href="/api/auth/gmail/start"
            className="mt-4 inline-block rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground"
          >
            Reconnect Gmail
          </a>
        ) : (
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="mt-4 rounded-full bg-surface-muted px-5 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? "Trying…" : "Try again"}
          </button>
        )}
      </StatePage>
    );
  }

  if (items.length === 0) {
    return (
      <StatePage connectedEmail={connectedEmail} onRefresh={reload} loading={loading} notice={notice}>
        <p className="font-semibold">Nothing to watch yet</p>
        <p className="mt-1 text-sm text-muted">
          No YouTube, Hudl, Veo or Google Doc links in your email from the last 30 days.
        </p>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="mt-4 rounded-full bg-surface-muted px-5 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Checking…" : "Check again"}
        </button>
      </StatePage>
    );
  }

  return <Feed items={items} connectedEmail={connectedEmail} onRefresh={reload} loading={loading} notice={notice} />;
}

// Dark, full-height backdrop for the feed and its loading state.
function FeedShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-full bg-black text-white">{children}</div>;
}

// The card you were on, so flipping to another mode and back returns to it.
let lastPosition: { email: string; key: string } | null = null;

function Feed({
  items,
  connectedEmail,
  onRefresh,
  loading,
  notice,
}: {
  items: FeedItem[];
  connectedEmail: string;
  onRefresh: () => void;
  loading: boolean;
  notice?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => {
    const i = lastPosition?.email === connectedEmail ? items.findIndex((it) => it.key === lastPosition!.key) : -1;
    return Math.max(0, i);
  });

  // Start on that card, before the first paint (no visible jump).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && active > 0) scroller.scrollTop = active * scroller.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    lastPosition = { email: connectedEmail, key: items[active]?.key ?? "" };
  }, [active, connectedEmail, items]);
  const [showNotice, setShowNotice] = useState(Boolean(notice));

  useEffect(() => {
    if (!showNotice) return;
    const t = setTimeout(() => setShowNotice(false), 3000);
    return () => clearTimeout(t);
  }, [showNotice]);

  // Whichever card is mostly on screen is the one playing.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root: scroller, threshold: 0.6 },
    );
    for (const card of scroller.children) observer.observe(card);
    return () => observer.disconnect();
  }, [items]);

  function go(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = Math.max(0, Math.min(items.length - 1, index));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: target * scroller.clientHeight, behavior: reduce ? "instant" : "smooth" });
  }

  // Arrow keys (and j/k) on a keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || document.querySelector("[role=dialog]")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(active + 1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(active - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <FeedShell>
      <div
        ref={scrollerRef}
        role="feed"
        aria-label="Film and docs from your email"
        aria-busy={loading}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <FeedCard key={item.key} item={item} index={i} total={items.length} active={i === active} />
        ))}
      </div>

      {/* Top bar over the feed */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pt-3 pb-8">
        <p className="text-sm font-semibold">
          <span className="text-accent">The Docket</span>
          <span className="ml-2 text-white/70" aria-live="polite">
            {active + 1} / {items.length}
          </span>
        </p>
        <FeedMenu connectedEmail={connectedEmail} onRefresh={onRefresh} loading={loading} />
      </div>

      {showNotice && notice && (
        <p
          role="status"
          className="absolute inset-x-4 top-14 rounded-2xl bg-white/15 px-4 py-2.5 text-center text-sm font-medium backdrop-blur-md"
        >
          {notice}
        </p>
      )}
    </FeedShell>
  );
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

const OPEN_LABEL = { youtube: "Open in YouTube", hudl: "Open in Hudl", veo: "Open in Veo", gdoc: "Open in Google Docs" };

function FeedCard({ item, index, total, active }: { item: FeedItem; index: number; total: number; active: boolean }) {
  const embeds = item.platform === "youtube" || item.platform === "gdoc";
  return (
    <article
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={`${PLATFORM_LABEL[item.platform]} from ${item.from}: ${item.subject}`}
      className="relative flex h-full snap-start snap-always flex-col"
    >
      {/* The media sits between the top bar and the caption, leaving room
          above and below it to swipe to the next card. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pt-14 pb-[calc(15rem+env(safe-area-inset-bottom))]">
        {item.platform === "youtube" && <YouTubeMedia url={item.url} active={active} />}
        {item.platform === "gdoc" && <DocMedia url={item.url} active={active} />}
        {(item.platform === "hudl" || item.platform === "veo") && <OpenElsewhere item={item} />}
      </div>

      {/* Caption: who sent it */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-12 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          <p className="flex items-center gap-2 text-xs text-white/70">
            <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold text-white">
              {PLATFORM_LABEL[item.platform]}
            </span>
            {formatDate(item.date)}
          </p>
          <p className="mt-1.5 truncate text-lg font-semibold">{item.from}</p>
          <p className="line-clamp-2 text-sm text-white/80">{item.subject}</p>
          {embeds && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-accent"
            >
              {OPEN_LABEL[item.platform]} ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// Only the card on screen loads a live player; the rest show a thumbnail, so
// the feed stays quick and only one video plays at a time.
function YouTubeMedia({ url, active }: { url: string; active: boolean }) {
  const video = youtubeVideo(url);
  const box = video?.vertical ? "aspect-[9/16] h-full max-w-full" : "aspect-video w-full max-w-3xl";
  if (!video) return <OpenElsewhere item={{ platform: "youtube", url }} />;
  return (
    <div className={`relative ${box}`}>
      <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white/5">
        {active ? (
          <iframe
            src={video.embedUrl}
            title="YouTube video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          video.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail placeholder
            <img src={video.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          )
        )}
      </div>
      {/* Mounted afresh each time this card's video starts. */}
      {active && <UnmuteHint inside={video.vertical} />}
    </div>
  );
}

// Videos start muted (phones only let them start by themselves that way), so
// a small reminder fades in as each one starts and fades out again. It sits
// below the video, or near the bottom of a tall Short, never over YouTube's
// controls, and taps pass straight through it.
const HINT_SHOWN_FOR = 2500;

function UnmuteHint({ inside }: { inside: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), HINT_SHOWN_FOR);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
    };
  }, []);
  return (
    <p
      role="status"
      data-unmute-hint
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-white/90 ring-1 ring-white/15 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-500 ${
        inside ? "bottom-16" : "top-full mt-3"
      } ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="sr-only">Video is playing muted. </span>
      Tap <span aria-hidden>🔇</span>
      <span className="sr-only">the speaker button</span> to unmute
    </p>
  );
}

// A read-only preview of the Doc. Swipes pass straight over it; the "Open in
// Google Docs" link is there to read it properly (or if it's private).
function DocMedia({ url, active }: { url: string; active: boolean }) {
  const preview = googleDocPreview(url);
  return (
    <div className="relative h-full w-full max-w-md overflow-hidden rounded-2xl bg-white">
      {active && preview ? (
        <iframe src={preview} title="Google Doc preview" tabIndex={-1} className="pointer-events-none absolute inset-0 h-full w-full" />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl" aria-hidden>
          📄
        </div>
      )}
    </div>
  );
}

// Hudl and Veo don't allow playing their videos inside other apps.
function OpenElsewhere({ item }: { item: Pick<FeedItem, "platform" | "url"> }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center rounded-3xl bg-white/5 px-6 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl" aria-hidden>
        ▶
      </div>
      <p className="mt-3 text-sm text-white/70">{PLATFORM_LABEL[item.platform]} video</p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
      >
        {OPEN_LABEL[item.platform]}
      </a>
    </div>
  );
}

// ⋯ menu: which account, refresh, disconnect.
function FeedMenu({
  connectedEmail,
  onRefresh,
  loading,
  light = false,
}: {
  connectedEmail: string;
  onRefresh: () => void;
  loading: boolean;
  light?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirming(false);
    setError(null);
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectGmail();
        clearGmailLinksCache();
        setOpen(false);
      } catch {
        setError("Couldn’t disconnect. Try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Gmail options"
        className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none ${
          light ? "bg-surface-muted text-foreground" : "bg-white/15 text-white"
        }`}
      >
        ⋯
      </button>
      {open && (
        <Sheet onClose={close}>
          {confirming ? (
            <>
              <SheetTitle
                title="Disconnect Gmail?"
                subtitle={`The Docket will stop reading ${connectedEmail}, and Briefcase’s access is cancelled at Google. You can connect again anytime.`}
              />
              {error && <p className="px-1 text-sm text-red">{error}</p>}
              <SheetButton variant="danger" disabled={pending} onClick={disconnect}>
                {pending ? "Disconnecting…" : "Disconnect Gmail"}
              </SheetButton>
              <SheetButton disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </SheetButton>
            </>
          ) : (
            <>
              <SheetTitle title="Gmail" subtitle={`Reading ${connectedEmail}`} />
              <SheetButton
                variant="primary"
                disabled={loading}
                onClick={() => {
                  onRefresh();
                  close();
                }}
              >
                {loading ? "Checking…" : "Check for new links"}
              </SheetButton>
              <SheetButton onClick={() => setConfirming(true)}>Disconnect Gmail</SheetButton>
              <SheetButton onClick={close}>Close</SheetButton>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

// Loading problems and the empty state, on the app's usual background.
function StatePage({
  connectedEmail,
  onRefresh,
  loading,
  notice,
  children,
}: {
  connectedEmail: string;
  onRefresh: () => void;
  loading: boolean;
  notice?: string;
  children: React.ReactNode;
}) {
  return (
    <PageScroller>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-accent-ink uppercase">Daily Mode</p>
          <h1 className="text-3xl font-bold tracking-tight">The Docket</h1>
        </div>
        <FeedMenu connectedEmail={connectedEmail} onRefresh={onRefresh} loading={loading} light />
      </div>
      {notice && (
        <p role="status" className="mt-4 rounded-2xl bg-green/15 px-4 py-3 text-sm font-medium">
          {notice}
        </p>
      )}
      <div className="mt-6 rounded-3xl bg-surface p-6 text-center">{children}</div>
    </PageScroller>
  );
}
