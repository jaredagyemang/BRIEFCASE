"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMail } from "@/components/mail-provider";
import {
  cleanSearch,
  type CardStatus,
  type DocketInfo,
  type GmailSearchResult,
  type SearchResult,
} from "@/lib/gmail/docket-types";

// The Docket's search: players' names (and senders and subjects) across every
// Info card Briefcase has read for this coach, including ones that left the
// feed, and, on request, the whole mailbox (Gmail or Outlook).

type GmailState =
  | { term: string; status: "searching" }
  | {
      term: string;
      status: "reading";
      results: SearchResult[];
      reading: number;
    }
  | { term: string; status: "done"; results: SearchResult[]; failed: string[] }
  | { term: string; status: "expired" }
  | { term: string; status: "error"; message: string };

// The last results, kept while the app is open so coming back from a card
// shows them straight away (they're checked again in the background). Tied
// to the connected address, so another account never sees them.
let cacheOwner = "";
let docketCache = new Map<string, SearchResult[]>();
let gmailCache: Record<string, GmailState> = {};
function cachesFor(connectedEmail: string) {
  if (cacheOwner !== connectedEmail) {
    cacheOwner = connectedEmail;
    docketCache = new Map();
    gmailCache = {};
  }
}

async function post<T>(body: object): Promise<T> {
  const res = await fetch("/docket/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json() as Promise<T>;
}

// The search box, and its results while there's a search; otherwise the rest
// of The Docket's home screen (children).
export function DocketSearch({ connectedEmail, children }: { connectedEmail: string; children: React.ReactNode }) {
  cachesFor(connectedEmail);
  // Starts from the search in the address (?q=…), e.g. coming back from a card.
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const term = cleanSearch(query);
  const searching = term.length >= 2;
  const [local, setLocal] = useState<{
    term: string;
    results: SearchResult[] | null;
  } | null>(() => (docketCache.has(term) ? { term, results: docketCache.get(term)! } : null));
  // Gmail searches by search text, so a slow one can't overwrite another.
  const [gmail, setGmail] = useState<Record<string, GmailState>>(() => gmailCache);

  // Search the read cards as the coach types (a moment after they pause).
  useEffect(() => {
    // Keep the search in the address, so ‹ Back from a card returns to it.
    const url = new URL(window.location.href);
    if ((url.searchParams.get("q") ?? "") !== term) {
      if (term) url.searchParams.set("q", term);
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    if (term.length < 2) return;
    let current = true;
    const t = setTimeout(() => {
      post<SearchResult[]>({ kind: "docket", q: term })
        .catch(() => null)
        .then((results) => {
          if (!current) return;
          if (results) docketCache.set(term, results);
          setLocal({ term, results });
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [term]);

  function updateGmail(next: GmailState) {
    setGmail((prev) => (gmailCache = { ...prev, [next.term]: next }));
  }

  async function searchGmail() {
    const forTerm = term;
    updateGmail({ term: forTerm, status: "searching" });
    let found: GmailSearchResult;
    try {
      found = await post<GmailSearchResult>({ kind: "gmail", q: forTerm });
    } catch {
      found = {
        status: "error",
        message: "Couldn’t reach the server. Check your connection.",
      };
    }
    if (found.status !== "ok") return updateGmail({ term: forTerm, ...found });

    // Emails the AI hasn't read yet: read them now.
    const unread = found.results.filter((r) => !r.info).map((r) => r.id);
    if (unread.length === 0)
      return updateGmail({
        term: forTerm,
        status: "done",
        results: found.results,
        failed: [],
      });
    updateGmail({
      term: forTerm,
      status: "reading",
      results: found.results,
      reading: unread.length,
    });
    const cards = await post<Record<string, DocketInfo | null>>({
      kind: "read",
      ids: unread,
    }).catch(() => ({}) as Record<string, DocketInfo | null>);
    const results = found.results.map((r) => {
      const info = cards[r.id];
      if (!info) return r;
      const status: CardStatus = info.recruiting === "no" ? { kind: "not_recruiting" } : r.status;
      return { ...r, info, status };
    });
    updateGmail({
      term: forTerm,
      status: "done",
      results,
      failed: unread.filter((id) => !cards[id]),
    });
  }

  // Clears the search and closes it (and the keyboard), back to The Docket's home.
  const input = useRef<HTMLInputElement>(null);
  function closeSearch() {
    setQuery("");
    input.current?.blur();
  }

  const localResults = searching && local?.term === term ? local.results : undefined;
  const gmailNow = searching ? (gmail[term] ?? null) : null;
  const localIds = new Set((localResults ?? []).map((r) => r.id));

  return (
    <>
      {/* A way back while searching, like "‹ Events" in Events. */}
      {query && (
        <button type="button" onClick={closeSearch} className="mt-4 self-start text-accent-ink" data-search-back>
          ‹ The Docket
        </button>
      )}
      <div className={`relative ${query ? "mt-2" : "mt-6"}`}>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && closeSearch()}
          placeholder="Search players by name"
          aria-label="Search players by name"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={80}
          className="w-full rounded-2xl border border-border bg-surface py-3.5 pr-12 pl-12 text-base outline-none focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-surface-muted"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        )}
      </div>

      {!searching ? (
        children
      ) : (
        <div className="mt-4" aria-live="polite" data-search-results>
          {localResults === undefined ? (
            <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted">
              <Spinner /> Searching…
            </p>
          ) : localResults === null ? (
            <p className="px-1 py-3 text-sm text-red">Couldn’t search right now. Check your connection.</p>
          ) : localResults.length === 0 ? (
            <div className="rounded-3xl bg-surface px-6 py-6 text-center" data-no-matches>
              <p className="font-semibold">No matches</p>
              <p className="mt-1 text-sm text-muted">No player cards in your Docket match “{term}”.</p>
            </div>
          ) : (
            <ResultList results={localResults} />
          )}

          {localResults !== undefined && (
            <GmailSection
              term={term}
              state={gmailNow}
              // Already listed above: don't show twice.
              results={gmailNow && "results" in gmailNow ? gmailNow.results.filter((r) => !localIds.has(r.id)) : []}
              foundAny={gmailNow && "results" in gmailNow ? gmailNow.results.length > 0 : false}
              failed={gmailNow?.status === "done" ? gmailNow.failed : []}
              onSearch={searchGmail}
            />
          )}
        </div>
      )}
    </>
  );
}

function GmailSection({
  term,
  state,
  results,
  foundAny,
  failed,
  onSearch,
}: {
  term: string;
  state: GmailState | null;
  results: SearchResult[];
  foundAny: boolean;
  failed: string[];
  onSearch: () => void;
}) {
  const mail = useMail();
  if (!state || state.status === "error") {
    return (
      <div className="mt-6 text-center">
        {state?.status === "error" && <p className="mb-2 text-sm text-red">{state.message}</p>}
        <p className="text-sm text-muted">Not here? It may be older than Briefcase has read.</p>
        <button
          type="button"
          onClick={onSearch}
          className="mt-3 w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
        >
          Search {mail.name} for “{term}”
        </button>
      </div>
    );
  }
  if (state.status === "expired") {
    return (
      <div className="mt-6 rounded-3xl bg-surface px-6 py-6 text-center">
        <p className="font-semibold">{mail.name} needs reconnecting</p>
        <p className="mt-1 text-sm text-muted">
          {mail.company} stopped accepting this connection. Connect again to search {mail.name}.
        </p>
        <a
          href={mail.connectPath}
          className="mt-4 inline-block rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground"
        >
          Reconnect {mail.name}
        </a>
      </div>
    );
  }
  if (state.status === "searching") {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted" data-gmail-status="searching">
        <Spinner /> Searching {mail.name}…
      </p>
    );
  }
  return (
    <div className="mt-6" data-gmail-results>
      <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Found in {mail.name}</h2>
      {state.status === "reading" && (
        <p className="mb-2 flex items-center gap-2 px-1 text-sm text-muted" data-gmail-status="reading">
          <Spinner /> Reading {state.reading} {state.reading === 1 ? "email" : "emails"}…
        </p>
      )}
      {results.length > 0 ? (
        <ResultList results={results} reading={state.status === "reading"} failed={failed} />
      ) : (
        <div className="rounded-3xl bg-surface px-6 py-6 text-center" data-gmail-none>
          <p className="font-semibold">{foundAny ? `Nothing new in ${mail.name}` : `No matches in ${mail.name}`}</p>
          <p className="mt-1 text-sm text-muted">
            {foundAny
              ? `The emails with film links that mention “${term}” are already listed above.`
              : mail.provider === "google"
                ? `No emails with film links mention “${term}”. Gmail matches whole words, so try the full first or last name.`
                : `No emails with film links mention “${term}”. Try the full first or last name.`}
          </p>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<CardStatus["kind"], string | null> = {
  feed: "In feed",
  skipped: "Skipped",
  declined: "Replied",
  not_recruiting: "Not recruiting",
  older: "Older",
};

function ResultList({
  results,
  reading = false,
  failed = [],
}: {
  results: SearchResult[];
  reading?: boolean;
  failed?: string[];
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-surface">
      {results.map((r) => {
        const name = r.info?.name?.value ?? r.from ?? "Unknown player";
        const details = [r.info?.position?.value, r.info?.grad_year?.value, r.info?.club?.value].filter(Boolean);
        const labels = [
          STATUS_LABEL[r.status.kind],
          r.shortlisted ? "Shortlisted" : null,
          r.shared ? "Shared" : null,
        ].filter((l): l is string => Boolean(l));
        return (
          <li key={r.id}>
            <Link
              href={`/docket/card/${encodeURIComponent(r.id)}?from=search`}
              className="flex items-center gap-3 px-4 py-3 active:bg-surface-muted"
              data-result={r.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{name}</p>
                {details.length > 0 && <p className="truncate text-sm">{details.join(" · ")}</p>}
                <p className="truncate text-xs text-muted">
                  {[r.info?.name && r.from !== name ? r.from : null, r.subject, formatDate(r.date)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!r.info && reading ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Spinner /> Reading…
                    </span>
                  ) : !r.info && failed.includes(r.id) ? (
                    <span className="text-xs text-muted">Couldn’t read yet: open to try again</span>
                  ) : (
                    labels.map((l) => (
                      <span
                        key={l}
                        className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium"
                        data-label={l}
                      >
                        {l}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />;
}
