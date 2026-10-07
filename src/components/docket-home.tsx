"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FeedMenu, StatePage } from "@/components/docket-feed";
import { DocketSearch } from "@/components/docket-search";
import { useMail } from "@/components/mail-provider";
import { saveCheckSpam, useCheckSpam } from "@/components/docket-settings";
import { StaffActivity } from "@/components/staff-activity";
import { useDocket } from "@/components/use-docket";
import { DEFAULT_RANGE, RANGES, inRange, rangeFor, type RangeId } from "@/lib/gmail/docket-types";

// The chosen time range, remembered on this device (read after hydration;
// the server renders the default).
const RANGE_KEY = "briefcase:docket:range";
const RANGE_EVENT = "briefcase:docket-range";
function readRange(): RangeId {
  try {
    return rangeFor(localStorage.getItem(RANGE_KEY)).id;
  } catch {
    return DEFAULT_RANGE;
  }
}
function subscribeRange(onChange: () => void) {
  window.addEventListener(RANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function saveRange(id: RangeId) {
  try {
    localStorage.setItem(RANGE_KEY, id);
  } catch {}
  window.dispatchEvent(new Event(RANGE_EVENT));
}

// The Docket's home screen: search for a player, or pick a time range, see
// how many players there are to review in it (updating live as the AI reads
// new emails), then start reviewing, or jump straight to the Shortlist; and
// the team's activity in that range.
export function DocketHome({ connectedEmail, notice }: { connectedEmail: string; notice?: string }) {
  const mail = useMail();
  const { result, loading, reload, failed } = useDocket(connectedEmail);
  const range = rangeFor(useSyncExternalStore(subscribeRange, readRange, () => DEFAULT_RANGE));
  // Not when coming back to this screen later (e.g. from a card), after the
  // address was tidied up below.
  const [showNotice, setShowNotice] = useState(
    () => Boolean(notice) && (typeof window === "undefined" || ["gmail", "outlook"].some((k) => new URLSearchParams(window.location.search).has(k))),
  );
  // The message came from "?gmail=…" or "?outlook=…"; drop that from the address so going
  // back here later doesn't show it again (keeping any search in it).
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("outlook");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [notice]);
  useEffect(() => {
    if (!showNotice) return;
    const t = setTimeout(() => setShowNotice(false), 4000);
    return () => clearTimeout(t);
  }, [showNotice]);

  if (result && result.status !== "ok") {
    const expired = result.status === "expired" || result.status === "not_connected";
    return (
      <StatePage connectedEmail={connectedEmail} onRefresh={reload} loading={loading}>
        <p className="font-semibold">{expired ? `${mail.name} needs reconnecting` : `Couldn’t read ${mail.name}`}</p>
        <p className="mt-1 text-sm text-muted">
          {expired
            ? `${mail.company} stopped accepting this connection (it expired or access was removed). Connect again to keep reading links.`
            : result.message}
        </p>
        {expired ? (
          <a
            href={mail.connectPath}
            className="mt-4 inline-block rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground"
          >
            Reconnect {mail.name}
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

  // Players to review in this range (read by the AI and at least possibly
  // recruiting), and emails the AI hasn't read yet.
  const emails = result?.status === "ok" ? result.emails : [];
  const inThisRange = emails.filter((e) => inRange(e, range.hours));
  // (Emails the AI couldn't read count too: they're shown with Try again.)
  const ready = inThisRange.filter((e) => (e.info ? e.info.recruiting !== "no" : failed.has(e.id))).length;
  // (Plus emails from Spam still being checked, when that's on.)
  const spamChecking = result?.status === "ok" ? result.spamPending.filter((p) => inRange(p, range.hours)).length : 0;
  const checking = inThisRange.filter((e) => !e.info && !failed.has(e.id)).length + spamChecking;
  const loaded = result?.status === "ok";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pt-4 pb-36 sm:pt-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wide text-accent-ink uppercase">Daily Mode</p>
            <h1 className="text-3xl font-bold tracking-tight">The Docket</h1>
          </div>
          <FeedMenu connectedEmail={connectedEmail} onRefresh={reload} loading={loading} light />
        </div>

        {showNotice && notice && (
          <p role="status" className="mt-4 rounded-2xl bg-green/15 px-4 py-3 text-sm font-medium">
            {notice}
          </p>
        )}

        <DocketSearch connectedEmail={connectedEmail}>
          <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Time range</h2>
          <div
            role="radiogroup"
            aria-label="Time range"
            className="grid grid-cols-5 gap-1 rounded-2xl bg-surface-muted p-1"
          >
            {RANGES.map((r) => {
              const selected = r.id === range.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => saveRange(r.id)}
                  className={`rounded-xl px-1 py-2 text-sm font-semibold transition ${
                    selected ? "bg-foreground text-background shadow-sm" : "text-muted"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <SpamToggle />

          <div className="mt-6 rounded-3xl bg-surface px-6 py-8 text-center" aria-live="polite">
            {!loaded ? (
              <p className="text-muted">Checking your email…</p>
            ) : (
              <>
                <p className="text-5xl font-bold tracking-tight tabular-nums" data-count>
                  {ready}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {ready === 0
                    ? `No new items${checking > 0 ? " yet" : ""}`
                    : `new ${ready === 1 ? "item" : "items"}${checking > 0 ? " so far" : ""}`}{" "}
                  in {range.phrase}
                </p>
                {checking > 0 && (
                  <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
                    Checking {checking} more {checking === 1 ? "email" : "emails"}…
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {ready > 0 ? (
              <Link
                href={`/docket/review?range=${range.id}`}
                className="block w-full rounded-2xl bg-accent py-4 text-center text-lg font-semibold text-accent-foreground"
              >
                Start Reviewing
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-foreground opacity-40"
              >
                Start Reviewing
              </button>
            )}
            <Link
              href="/docket/shortlist"
              className="block w-full rounded-2xl bg-surface py-4 text-center text-lg font-semibold"
            >
              View Shortlist
            </Link>
          </div>

          <StaffActivity connectedEmail={connectedEmail} hours={range.hours} phrase={range.phrase} />
        </DocketSearch>
      </div>
    </div>
  );
}

// "Also check Spam" (Outlook: Junk): widens what's checked, not what's shown
// (only emails the AI judges recruiting, or unsure, come through, marked
// "Found in Spam").
function SpamToggle() {
  const on = useCheckSpam() ?? false;
  const mail = useMail();
  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3">
      <div className="min-w-0">
        <p id="check-spam" className="font-semibold">
          Also check {mail.spam}
        </p>
        <p className="text-xs text-muted">Only recruiting emails come through, marked “Found in {mail.spam}”.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="check-spam"
        onClick={() => saveCheckSpam(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-surface-muted"}`}
      >
        <span
          className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}
