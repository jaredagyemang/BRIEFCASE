"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityLine } from "@/components/activity-line";
import type { ActivityEntry, ActivityPage } from "@/lib/gmail/docket-types";

// Team activity on The Docket's home, for the time range picked there:
// Shortlist and Share to team (added or removed) and replies that turn a
// player down, by any coach, newest first.

type Loaded = { entries: ActivityEntry[]; more: boolean };

// The last lists, kept while the app is open so coming back shows them
// straight away (they're loaded again in the background). Tied to the
// connected address, like the rest of The Docket.
let cacheOwner = "";
let cache = new Map<number, Loaded>();
function cacheFor(connectedEmail: string) {
  if (cacheOwner !== connectedEmail) {
    cacheOwner = connectedEmail;
    cache = new Map();
  }
  return cache;
}

async function fetchPage(hours: number, before?: string): Promise<ActivityPage> {
  try {
    const res = await fetch("/docket/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, before }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ActivityPage;
  } catch {
    return { status: "error", message: "Couldn’t load team activity. Check your connection." };
  }
}

export function TeamActivity({
  connectedEmail,
  hours,
  phrase,
}: {
  connectedEmail: string;
  hours: number;
  phrase: string;
}) {
  const lists = cacheFor(connectedEmail);
  const [loaded, setLoaded] = useState<{ hours: number; list: Loaded } | null>(() =>
    lists.has(hours) ? { hours, list: lists.get(hours)! } : null,
  );
  const [failed, setFailed] = useState<{ hours: number; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchPage(hours).then((page) => {
      if (!current) return;
      if (page.status === "ok") {
        const list = { entries: page.entries, more: page.more };
        lists.set(hours, list);
        setLoaded({ hours, list });
        setFailed(null);
      } else setFailed({ hours, message: page.message });
    });
    return () => {
      current = false;
    };
  }, [hours, attempt, lists]);

  async function showMore(list: Loaded) {
    setLoadingMore(true);
    const page = await fetchPage(hours, list.entries.at(-1)?.at);
    setLoadingMore(false);
    if (page.status !== "ok") return setFailed({ hours, message: page.message });
    const next = { entries: [...list.entries, ...page.entries], more: page.more };
    lists.set(hours, next);
    setLoaded((prev) => (prev?.hours === hours ? { hours, list: next } : prev));
  }

  const list = loaded?.hours === hours ? loaded.list : null;
  const error = failed?.hours === hours ? failed.message : null;

  return (
    <section className="mt-8" aria-labelledby="team-activity" data-team-activity>
      <h2 id="team-activity" className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        Team activity
      </h2>
      {!list ? (
        error ? (
          <div className="rounded-3xl bg-surface px-6 py-6 text-center">
            <p className="text-sm text-red">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-3 rounded-full bg-surface-muted px-5 py-2 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="rounded-3xl bg-surface px-6 py-6 text-center text-sm text-muted">Loading…</p>
        )
      ) : list.entries.length === 0 ? (
        <p className="rounded-3xl bg-surface px-6 py-6 text-center text-sm text-muted" data-activity-empty>
          No team activity in {phrase}.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-surface">
            {list.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  className="flex items-center gap-3 px-4 py-3 active:bg-surface-muted"
                  data-activity={entry.id}
                >
                  <div className="min-w-0 flex-1">
                    <ActivityLine entry={entry} />
                  </div>
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 px-1 text-sm text-red">{error}</p>}
          {list.more && (
            <button
              type="button"
              onClick={() => showMore(list)}
              disabled={loadingMore}
              className="mt-3 w-full rounded-2xl bg-surface py-3 text-sm font-semibold disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
