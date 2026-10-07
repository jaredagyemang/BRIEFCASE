"use client";

import { useEffect, useRef, useState } from "react";
import { youtubeVideo } from "@/lib/gmail/links";

// The YouTube player used everywhere a player's film is shown: the swipe
// feed, a card on its own, the Shortlist, Shared with team and staff
// activity. The same embedded player each time (privacy-enhanced domain,
// plays inline, starts muted).
//
// Staying in Briefcase: the player is sandboxed without permission to open
// windows or navigate the app, so tapping YouTube's logo, the video title or
// "Watch on YouTube" inside it doesn't hand the coach off to the YouTube app.
// Opening YouTube is always one deliberate tap away on our own "Open on
// YouTube" link, outside the player.
//
// Videos that can't play here (embedding turned off by the uploader, private,
// removed, age-restricted…) are detected from the player's own error report
// (the IFrame API's onError event) and replaced with a short message and an
// "Open on YouTube" button. Briefcase talks to the player with the same window
// messages YouTube's IFrame API script uses, without loading that script into
// the app.

export const OPEN_ON_YOUTUBE = "Open on YouTube";

// onError codes: 2 bad video ID, 5 player error, 100 not found / private /
// removed, 101 and 150 embedding not allowed, 153 the request wasn't
// identified (no referrer).
const PLAYER_ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com"];

export function YouTubePlayer({
  url,
  active,
  box,
  dark = true,
}: {
  url: string;
  // Only the video on screen gets a live player; the rest show a thumbnail.
  active: boolean;
  // Size classes for the player's box.
  box: string;
  // On a dark (film) background.
  dark?: boolean;
}) {
  const video = youtubeVideo(url);
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<number | null>(null);

  // Listen for the player's events, as the IFrame API does: say "listening"
  // until the player answers, then watch for onError.
  useEffect(() => {
    if (!active || !video) return;
    const id = Math.floor(Math.random() * 1e9);
    let answered = false;
    function onMessage(event: MessageEvent) {
      if (!PLAYER_ORIGINS.includes(event.origin) || event.source !== frame.current?.contentWindow) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      answered = true;
      const { event: name, info } = data as { event?: string; info?: unknown };
      if (name === "onError") setError(typeof info === "number" ? info : Number(info) || -1);
    }
    window.addEventListener("message", onMessage);
    const say = () =>
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), "*");
    let tries = 0;
    const timer = setInterval(() => {
      if (answered || ++tries > 40) return clearInterval(timer);
      say();
    }, 250);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [active, video?.embedUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- video is derived from url

  if (!video) return <CantPlay url={url} dark={dark} box={box} />;
  if (error !== null) return <CantPlay url={url} dark={dark} box={box} code={error} />;

  const src = `${video.embedUrl}&enablejsapi=1&origin=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`;
  return (
    <div className={`relative ${box}`} data-youtube-player>
      <div className={`absolute inset-0 overflow-hidden rounded-2xl ${dark ? "bg-white/5" : "bg-black"}`}>
        {active ? (
          <iframe
            ref={frame}
            src={src}
            title="YouTube video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // No allow-popups / allow-top-navigation: links inside the player
            // can't open YouTube (see above).
            sandbox="allow-scripts allow-same-origin allow-presentation"
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
      {/* Mounted afresh each time this video starts. */}
      {active && <UnmuteHint inside={video.vertical} />}
    </div>
  );
}

// "This video can't play inside BRIEFCASE", with a way to watch it on YouTube.
function CantPlay({ url, box, dark, code }: { url: string; box: string; dark: boolean; code?: number }) {
  return (
    <div
      className={`flex ${box} flex-col items-center justify-center rounded-2xl px-6 py-8 text-center ${
        dark ? "bg-white/5 text-white" : "bg-surface-muted text-foreground"
      }`}
      data-youtube-cant-play={code ?? "link"}
      role="status"
    >
      <p className="font-semibold">This video can’t play inside BRIEFCASE</p>
      <p className={`mt-1 text-sm ${dark ? "text-white/70" : "text-muted"}`}>
        {code === 101 || code === 150
          ? "Its owner doesn’t allow it to play in other apps."
          : code === 100
            ? "It may be private or removed."
            : "YouTube wouldn’t play it here."}
      </p>
      <OpenOnYouTube url={url} className="mt-4 w-full max-w-xs" />
    </div>
  );
}

// Opens the video on YouTube in a new tab, like "Open in SportsRecruits".
export function OpenOnYouTube({ url, className = "" }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-2xl bg-accent py-3.5 text-center font-semibold text-accent-foreground ${className}`}
    >
      {OPEN_ON_YOUTUBE} ↗
    </a>
  );
}

// In a list (Shortlist, Shared with team): a thumbnail that becomes the
// player when tapped, so a list of players doesn't start every video at once.
export function YouTubeInline({ url }: { url: string }) {
  const video = youtubeVideo(url);
  const [playing, setPlaying] = useState(false);
  const box = video?.vertical ? "aspect-[9/16] w-full max-w-[16rem] mx-auto" : "aspect-video w-full";
  if (!playing && video) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label="Play the YouTube video here"
        className={`relative block overflow-hidden rounded-2xl bg-black ${box}`}
        data-youtube-thumb
      >
        {video.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail
          <img src={video.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-85" />
        )}
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-2xl text-white ring-1 ring-white/30">
            ▶
          </span>
        </span>
      </button>
    );
  }
  return (
    <div className="scheme-dark rounded-2xl bg-black pt-10">
      <YouTubePlayer url={url} active box={box} />
    </div>
  );
}

// Videos start muted (phones only let them start by themselves that way), so
// a small reminder fades in as each one starts and fades out again. It points
// at YouTube's own speaker button, which sits in the video's top-left corner
// while it plays muted: just above that corner, or beside it inside a tall
// Short (which has no room above). It never covers the button, and taps pass
// straight through it.
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
      className={`pointer-events-none absolute rounded-full bg-black/80 px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-white/90 ring-1 ring-white/15 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-500 ${
        inside ? "top-3 left-16" : "bottom-full left-1 mb-2.5"
      } ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Little pointer toward the speaker button: down at the corner, or
          left at the button beside it. */}
      <span
        aria-hidden
        className={`absolute h-2.5 w-2.5 rotate-45 border-white/15 bg-black ${
          inside ? "top-1/2 -left-[5px] -translate-y-1/2 border-b border-l" : "-bottom-[5px] left-5 border-r border-b"
        }`}
      />
      <span className="sr-only">Video is playing muted. </span>
      <span className="relative">
        Tap <span aria-hidden>🔇</span>
        <span className="sr-only">the speaker button</span> to unmute
      </span>
    </p>
  );
}
