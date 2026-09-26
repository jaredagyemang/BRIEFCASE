"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { disconnectGmail, sendReplyAction, shortlistAction, skipAction } from "@/app/docket/actions";
import { PageScroller } from "@/components/page-scroller";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { clearDocketCache, useDocket } from "@/components/use-docket";
import {
  DECLINING,
  REPLY_TEMPLATES,
  type DocketEmail,
  type InfoField,
  type ReplyTemplate,
} from "@/lib/gmail/docket-types";
import { PLATFORM_LABEL, googleDocPreview, uniqueMedia, youtubeVideo, type FoundLink } from "@/lib/gmail/links";
import { TEMPLATE_LABEL, buildReply } from "@/lib/gmail/templates";

// The Docket: one row per player (per email), newest first. Swipe up/down to
// move between players, always landing on their Info card; swipe left/right
// to go from the Info card through each of their videos. Arrow keys work too.
export function DocketFeed({
  connectedEmail,
  coachName,
  notice,
}: {
  connectedEmail: string;
  coachName: string;
  notice?: string;
}) {
  const docket = useDocket(connectedEmail);
  const { result, loading, reload } = docket;

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

  if (result.emails.length === 0) {
    return (
      <StatePage connectedEmail={connectedEmail} onRefresh={reload} loading={loading} notice={notice}>
        <p className="font-semibold">Nothing to watch yet</p>
        <p className="mt-1 text-sm text-muted">
          No YouTube, Hudl, Veo or Google Doc links in your email from the last 30 days (or you’ve cleared them all).
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

  return (
    <Feed
      docket={docket}
      emails={result.emails}
      canSend={result.canSend}
      connectedEmail={connectedEmail}
      coachName={coachName}
      notice={notice}
    />
  );
}

// Dark, full-height backdrop for the feed and its loading state.
function FeedShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-full bg-black text-white">{children}</div>;
}

// The player you were on, so flipping to another mode and back returns to
// their Info card.
let lastPosition: { email: string; id: string } | null = null;

type Toast = { message: string; undo?: () => void };

function Feed({
  docket,
  emails,
  canSend,
  connectedEmail,
  coachName,
  notice,
}: {
  docket: ReturnType<typeof useDocket>;
  emails: DocketEmail[];
  canSend: boolean;
  connectedEmail: string;
  coachName: string;
  notice?: string;
}) {
  const { loading, reload, reading, failed, retryInfo, updateEmail, removeEmail, restoreEmail } = docket;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const media = useMemo(() => new Map(emails.map((e) => [e.id, uniqueMedia(e.links)])), [emails]);

  const [activeRow, setActiveRow] = useState(() => {
    const i = lastPosition?.email === connectedEmail ? emails.findIndex((e) => e.id === lastPosition!.id) : -1;
    return Math.max(0, i);
  });
  const row = Math.min(activeRow, emails.length - 1);
  const current = emails[row];
  // Which card each player's row is showing (0 = their Info card), updated
  // whenever a row scrolls, including when it's put back to 0 below.
  const [cols, setCols] = useState<Record<string, number>>({});
  const activeCol = (current && cols[current.id]) ?? 0;
  const cardCount = 1 + (media.get(current?.id)?.length ?? 0);

  // Start on that player, before the first paint (no visible jump).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && activeRow > 0) scroller.scrollTop = activeRow * scroller.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    if (current) lastPosition = { email: connectedEmail, id: current.id };
  }, [current, connectedEmail]);

  // Whichever player is mostly on screen is the active one.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveRow(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root: scroller, threshold: 0.6 },
    );
    for (const el of scroller.children) observer.observe(el);
    return () => observer.disconnect();
  }, [emails]);

  // Moving to another player always lands on their Info card: every other
  // row is put back to its first card (off screen, so it isn't seen).
  useEffect(() => {
    for (const [id, el] of rowRefs.current) {
      if (id !== current?.id && el.scrollLeft !== 0) el.scrollLeft = 0;
    }
  }, [current?.id]);

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function goRow(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = Math.max(0, Math.min(emails.length - 1, index));
    scroller.scrollTo({ top: target * scroller.clientHeight, behavior: reduceMotion() ? "instant" : "smooth" });
  }

  function goCol(index: number) {
    const el = current && rowRefs.current.get(current.id);
    if (!el) return;
    const target = Math.max(0, Math.min(cardCount - 1, index));
    el.scrollTo({ left: target * el.clientWidth, behavior: reduceMotion() ? "instant" : "smooth" });
  }

  // Arrow keys (and h/j/k/l) on a keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || document.querySelector("[role=dialog]")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const moves: Record<string, () => void> = {
        ArrowDown: () => goRow(row + 1),
        j: () => goRow(row + 1),
        ArrowUp: () => goRow(row - 1),
        k: () => goRow(row - 1),
        ArrowRight: () => goCol(activeCol + 1),
        l: () => goCol(activeCol + 1),
        ArrowLeft: () => goCol(activeCol - 1),
        h: () => goCol(activeCol - 1),
      };
      if (moves[e.key]) {
        e.preventDefault();
        moves[e.key]();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Messages at the top (with Undo where it makes sense) ---------------------
  const [toast, setToast] = useState<Toast | null>(notice ? { message: notice } : null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Actions from the Info card ------------------------------------------------
  function skip(email: DocketEmail) {
    const index = emails.findIndex((e) => e.id === email.id);
    removeEmail(email.id);
    skipAction(email.id, email.threadId, true).catch(() => {
      restoreEmail(email, index);
      setToast({ message: "Couldn’t skip that. Try again." });
    });
    setToast({
      message: "Skipped",
      undo: () => {
        restoreEmail(email, index);
        setToast(null);
        skipAction(email.id, email.threadId, false).catch(() => setToast({ message: "Couldn’t undo. Try again." }));
      },
    });
  }

  function toggleShortlist(email: DocketEmail) {
    const next = !email.shortlisted;
    updateEmail(email.id, { shortlisted: next });
    setToast({ message: next ? "Added to the Shortlist" : "Removed from the Shortlist" });
    shortlistAction(email.id, next).catch(() => {
      updateEmail(email.id, { shortlisted: !next });
      setToast({ message: "Couldn’t update the Shortlist. Try again." });
    });
  }

  function replied(email: DocketEmail, template: ReplyTemplate) {
    if (DECLINING.includes(template)) {
      removeEmail(email.id);
      setToast({ message: "Reply sent. Removed from your Docket." });
    } else {
      updateEmail(email.id, { replied: { template, at: new Date().toISOString() } });
      setToast({ message: "Reply sent" });
    }
  }

  return (
    <FeedShell>
      <div
        ref={scrollerRef}
        role="feed"
        aria-label="Players and film from your email"
        aria-busy={loading}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {emails.map((email, i) => (
          <PlayerRow
            key={email.id}
            email={email}
            media={media.get(email.id) ?? []}
            index={i}
            total={emails.length}
            active={i === row}
            activeCol={i === row ? activeCol : 0}
            rowRef={(el) => {
              if (el) rowRefs.current.set(email.id, el);
              else rowRefs.current.delete(email.id);
            }}
            onCol={(col) => setCols((prev) => (prev[email.id] === col ? prev : { ...prev, [email.id]: col }))}
            info={{
              reading: reading.has(email.id),
              failed: failed.has(email.id),
              onRetry: () => retryInfo(email.id),
              canSend,
              coachName,
              onSkip: () => skip(email),
              onShortlist: () => toggleShortlist(email),
              onReplied: (template) => replied(email, template),
            }}
          />
        ))}
      </div>

      {/* Top bar over the feed */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pt-3 pb-8">
        <p className="text-sm font-semibold">
          <span className="text-accent">The Docket</span>
          <span className="ml-2 text-white/70" aria-live="polite">
            {row + 1} / {emails.length}
          </span>
        </p>
        {/* Which card of this player: the Info card, then each video. */}
        {cardCount > 1 && (
          <div className="flex items-center gap-1.5" aria-label={`Card ${activeCol + 1} of ${cardCount}`} role="img">
            {Array.from({ length: cardCount }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === activeCol ? "w-4 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        )}
        <FeedMenu connectedEmail={connectedEmail} onRefresh={reload} loading={loading} />
      </div>

      {toast && (
        <div
          role="status"
          className="absolute inset-x-4 top-14 mx-auto flex max-w-md items-center justify-center gap-3 rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur-md"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="font-semibold text-accent">
              Undo
            </button>
          )}
        </div>
      )}
    </FeedShell>
  );
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

const OPEN_LABEL = { youtube: "Open in YouTube", hudl: "Open in Hudl", veo: "Open in Veo", gdoc: "Open in Google Docs" };

type InfoProps = {
  reading: boolean;
  failed: boolean;
  onRetry: () => void;
  canSend: boolean;
  coachName: string;
  onSkip: () => void;
  onShortlist: () => void;
  onReplied: (template: ReplyTemplate) => void;
};

// One player: their Info card, then their videos, side by side.
function PlayerRow({
  email,
  media,
  index,
  total,
  active,
  activeCol,
  rowRef,
  onCol,
  info,
}: {
  email: DocketEmail;
  media: FoundLink[];
  index: number;
  total: number;
  active: boolean;
  activeCol: number;
  rowRef: (el: HTMLDivElement | null) => void;
  onCol: (col: number) => void;
  info: InfoProps;
}) {
  const name = email.info?.name?.value;
  return (
    <article
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={`${name ?? "Player"} — from ${email.from}: ${email.subject}`}
      className="h-full snap-start snap-always"
    >
      <div
        ref={rowRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) onCol(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <InfoCard email={email} videoCount={media.length} {...info} />
        {media.map((link, i) => (
          <VideoCard key={link.url} email={email} link={link} active={active && activeCol === i + 1} />
        ))}
      </div>
    </article>
  );
}

// --- The Info card ------------------------------------------------------------------

const FIELD_LABEL = { position: "Position", grad_year: "Grad year", club: "Club", gpa: "GPA", major: "Major", budget: "Budget" };

// Blank when the email doesn't say; "Possibly …" when the AI only inferred it.
function FieldValue({ field, large = false }: { field: InfoField; large?: boolean }) {
  if (!field) return <span className="text-white/30">—</span>;
  if (field.source === "stated") return <span>{field.value}</span>;
  return (
    <span className="text-yellow">
      Possibly {field.value}
      <span className={`block font-normal text-yellow/75 ${large ? "text-sm" : "text-xs"}`}>
        — verify, AI may be wrong
      </span>
    </span>
  );
}

function InfoCard({
  email,
  videoCount,
  reading,
  failed,
  onRetry,
  canSend,
  coachName,
  onSkip,
  onShortlist,
  onReplied,
}: { email: DocketEmail; videoCount: number } & InfoProps) {
  const [replying, setReplying] = useState<ReplyTemplate | null>(null);
  const info = email.info;
  const pending = !info && !failed;

  return (
    <section
      aria-label={`Info card for ${info?.name?.value ?? "this player"}`}
      data-info-card
      className="flex h-full w-full shrink-0 snap-start snap-always flex-col overflow-y-auto px-4 pt-14 pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <p className="flex items-center gap-2 text-xs text-white/60">
          <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">Info</span>
          {formatDate(email.date)}
          {info && <span className="ml-auto">Read by AI</span>}
        </p>

        <h2 className="mt-3 text-2xl leading-tight font-bold">
          {info?.name ? (
            <FieldValue field={info.name} large />
          ) : pending ? (
            <span className="inline-block h-7 w-48 animate-pulse rounded-lg bg-white/10" aria-label="Reading…" />
          ) : (
            <span className="text-white/40">Name not in the email</span>
          )}
        </h2>
        <p className="mt-1 truncate text-sm text-white/70">
          From <span className="font-medium text-white">{email.from}</span>
          {email.fromEmail && email.fromEmail !== email.from && <span> · {email.fromEmail}</span>}
        </p>
        <p className="truncate text-sm text-white/50">{email.subject}</p>

        {pending && (
          <p className="mt-3 text-sm text-white/60" aria-live="polite">
            {reading ? "Reading the email…" : "Waiting to read the email…"}
          </p>
        )}
        {failed && !info && (
          <p className="mt-3 text-sm text-white/70">
            Couldn’t read this email automatically.{" "}
            <button type="button" onClick={onRetry} className="font-semibold text-accent">
              Try again
            </button>
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-white/5 p-4">
          {(Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]).map((key) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-white/50 uppercase">{FIELD_LABEL[key]}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold break-words">
                {pending ? (
                  <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10" />
                ) : (
                  <FieldValue field={info?.[key] ?? null} />
                )}
              </dd>
            </div>
          ))}
        </dl>
        {info?.more_players && (
          <p className="mt-2 text-xs text-white/60">This email mentions more players; this card shows the first.</p>
        )}

        <div className="mt-auto pt-4">
          {email.replied && (
            <p className="mb-2 text-sm text-white/70">
              ✓ Replied “{TEMPLATE_LABEL[email.replied.template]}” · {formatDate(email.replied.at)}
            </p>
          )}
          <p className="mb-1.5 text-xs font-medium tracking-wide text-white/50 uppercase">Reply</p>
          <div className="grid grid-cols-2 gap-2">
            {REPLY_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReplying(t)}
                className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold active:bg-white/20"
              >
                {TEMPLATE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onShortlist}
              aria-pressed={email.shortlisted}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                email.shortlisted ? "bg-accent text-accent-foreground" : "bg-white/10 active:bg-white/20"
              }`}
            >
              {email.shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white/80 active:bg-white/20"
            >
              Skip
            </button>
          </div>
          {videoCount > 0 && (
            <p className="mt-3 text-center text-sm text-white/50">
              Swipe for {videoCount === 1 ? "their video" : `${videoCount} videos`} →
            </p>
          )}
        </div>
      </div>

      {replying && (
        <ReplySheet
          email={email}
          template={replying}
          canSend={canSend}
          coachName={coachName}
          onClose={() => setReplying(null)}
          onSent={() => {
            onReplied(replying);
            setReplying(null);
          }}
        />
      )}
    </section>
  );
}

// Review (and edit) the reply before it's sent from the coach's Gmail.
function ReplySheet({
  email,
  template,
  canSend,
  coachName,
  onClose,
  onSent,
}: {
  email: DocketEmail;
  template: ReplyTemplate;
  canSend: boolean;
  coachName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState(() => buildReply(template, { info: email.info, senderName: email.from, coachName }));
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(!canSend);
  const [sending, startSending] = useTransition();

  function send() {
    setError(null);
    startSending(async () => {
      const result = await sendReplyAction(email.id, template, body).catch(() => ({
        ok: false as const,
        reason: "error" as const,
        message: "Couldn’t reach the server. Check your connection.",
      }));
      if (result.ok) onSent();
      else if (result.reason === "reconnect") setNeedsReconnect(true);
      else setError(result.message);
    });
  }

  return (
    <Sheet onClose={() => !sending && onClose()}>
      <SheetTitle title={`Reply: ${TEMPLATE_LABEL[template]}`} subtitle={`To ${email.from}${email.fromEmail ? ` <${email.fromEmail}>` : ""}`} />
      {needsReconnect ? (
        <>
          <p className="text-center text-sm text-muted">
            To send replies, Briefcase needs permission to send email from your Gmail. Reconnect once and allow it.
          </p>
          <a
            href="/api/auth/gmail/start"
            className="block w-full rounded-2xl bg-accent py-3.5 text-center font-semibold text-accent-foreground"
          >
            Reconnect Gmail
          </a>
          <SheetButton onClick={onClose}>Cancel</SheetButton>
        </>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            aria-label="Reply"
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-accent"
          />
          <p className="px-1 text-xs text-muted">Sent from your Gmail as a reply in the same conversation.</p>
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton variant="primary" disabled={sending || !body.trim()} onClick={send}>
            {sending ? "Sending…" : "Send reply"}
          </SheetButton>
          <SheetButton disabled={sending} onClick={onClose}>
            Cancel
          </SheetButton>
        </>
      )}
    </Sheet>
  );
}

// --- Video cards (unchanged from before: pure viewing) ------------------------------

function VideoCard({ email, link, active }: { email: DocketEmail; link: FoundLink; active: boolean }) {
  const embeds = link.platform === "youtube" || link.platform === "gdoc";
  return (
    <section
      aria-label={`${PLATFORM_LABEL[link.platform]} from ${email.from}`}
      className="relative flex h-full w-full shrink-0 snap-start snap-always flex-col"
    >
      {/* The media sits between the top bar and the caption, leaving room
          above and below it to swipe. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pt-14 pb-[calc(15rem+env(safe-area-inset-bottom))]">
        {link.platform === "youtube" && <YouTubeMedia url={link.url} active={active} />}
        {link.platform === "gdoc" && <DocMedia url={link.url} active={active} />}
        {(link.platform === "hudl" || link.platform === "veo") && <OpenElsewhere item={link} />}
      </div>

      {/* Caption: who sent it */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-12 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          <p className="flex items-center gap-2 text-xs text-white/70">
            <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold text-white">
              {PLATFORM_LABEL[link.platform]}
            </span>
            {formatDate(email.date)}
          </p>
          <p className="mt-1.5 truncate text-lg font-semibold">{email.from}</p>
          <p className="line-clamp-2 text-sm text-white/80">{email.subject}</p>
          {embeds && (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-accent"
            >
              {OPEN_LABEL[link.platform]} ↗
            </a>
          )}
        </div>
      </div>
    </section>
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
function OpenElsewhere({ item }: { item: Pick<FoundLink, "platform" | "url"> }) {
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
        clearDocketCache();
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
              <Link
                href="/docket/shortlist"
                onClick={close}
                className="block w-full rounded-2xl bg-surface-muted py-3.5 text-center font-semibold"
              >
                Shortlist
              </Link>
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
