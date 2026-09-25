"use client";

import { useEffect, useState, useTransition } from "react";
import { loadGmailLinks } from "@/app/docket/actions";
import type { GmailLinksResult } from "@/lib/gmail/connection";
import { PLATFORM_LABEL, type LinkPlatform } from "@/lib/gmail/links";

// The last result, kept while the app is open so flipping back to The Docket
// shows the list straight away instead of reading Gmail again. Tied to the
// connected address, so a different account never sees someone else's list.
let cache: { email: string; at: number; result: GmailLinksResult } | null = null;
const FRESH_FOR = 2 * 60 * 1000;

export function clearGmailLinksCache() {
  cache = null;
}

const PLATFORM_STYLE: Record<LinkPlatform, string> = {
  youtube: "bg-red/10 text-red",
  hudl: "bg-accent/20 text-accent-ink",
  veo: "bg-green/15 text-foreground",
  gdoc: "bg-surface-muted text-foreground",
};

function shortUrl(url: string) {
  const u = new URL(url);
  const rest = `${u.pathname}${u.search}`;
  return `${u.hostname.replace(/^www\./, "")}${rest.length > 32 ? rest.slice(0, 31) + "…" : rest}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GmailLinks({ connectedEmail }: { connectedEmail: string }) {
  const [result, setResult] = useState<GmailLinksResult | null>(() =>
    cache?.email === connectedEmail ? cache.result : null,
  );
  const [loading, startLoading] = useTransition();

  function load() {
    startLoading(async () => {
      const next = await loadGmailLinks().catch(
        (): GmailLinksResult => ({ status: "error", message: "Couldn’t reach the server. Check your connection." }),
      );
      cache = next.status === "ok" ? { email: connectedEmail, at: Date.now(), result: next } : null;
      setResult(next);
    });
  }

  useEffect(() => {
    if (!cache || cache.email !== connectedEmail || Date.now() - cache.at > FRESH_FOR) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per visit
  }, [connectedEmail]);

  if (!result) return <LoadingList />;

  if (result.status === "expired" || result.status === "not_connected") {
    return (
      <div className="mt-4 rounded-3xl bg-surface p-6 text-center">
        <p className="font-semibold">Gmail needs reconnecting</p>
        <p className="mt-1 text-sm text-muted">
          Google stopped accepting this connection (it expired or access was removed). Connect again to keep reading
          links.
        </p>
        <a
          href="/api/auth/gmail/start"
          className="mt-4 inline-block rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground"
        >
          Reconnect Gmail
        </a>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="mt-4 rounded-3xl bg-surface p-6 text-center">
        <p className="font-semibold">Couldn’t read Gmail</p>
        <p className="mt-1 text-sm text-muted">{result.message}</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-4 rounded-full bg-surface-muted px-5 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Trying…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <section className="mt-6" aria-labelledby="gmail-links-heading">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="gmail-links-heading" className="text-lg font-semibold">
          From your inbox
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm font-semibold text-accent-ink disabled:opacity-60"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {result.emails.length === 0 ? (
        <p className="rounded-3xl bg-surface p-8 text-center text-sm text-muted">
          No YouTube, Hudl, Veo or Google Doc links in your email from the last 30 days.
        </p>
      ) : (
        <ul className="space-y-2">
          {result.emails.map((email) => (
            <li key={email.id} className="rounded-2xl bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-semibold">{email.from}</p>
                <p className="shrink-0 text-xs text-muted">{formatDate(email.date)}</p>
              </div>
              <p className="truncate text-sm text-muted">{email.subject}</p>
              <ul className="mt-2 space-y-1.5">
                {email.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-sm"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PLATFORM_STYLE[link.platform]}`}
                      >
                        {PLATFORM_LABEL[link.platform]}
                      </span>
                      <span className="min-w-0 truncate text-accent-ink">{shortUrl(link.url)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 px-1 text-xs text-muted">
        Checked {result.scanned} {result.scanned === 1 ? "email" : "emails"} with possible links from the last 30 days
        (up to 100).
      </p>
    </section>
  );
}

function LoadingList() {
  return (
    <div className="mt-6 space-y-2" aria-busy="true" aria-label="Reading your recent email">
      <p className="px-1 text-sm text-muted">Reading your recent email…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  );
}
