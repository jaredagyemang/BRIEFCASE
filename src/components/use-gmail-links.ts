"use client";

import { useEffect, useState, useTransition } from "react";
import { loadGmailLinks } from "@/app/docket/actions";
import type { GmailLinksResult } from "@/lib/gmail/connection";

// The last result, kept while the app is open so flipping back to The Docket
// shows the feed straight away instead of reading Gmail again. Tied to the
// connected address, so a different account never sees someone else's feed.
let cache: { email: string; at: number; result: GmailLinksResult } | null = null;
const FRESH_FOR = 2 * 60 * 1000;

export function clearGmailLinksCache() {
  cache = null;
}

export function useGmailLinks(connectedEmail: string) {
  const [result, setResult] = useState<GmailLinksResult | null>(() =>
    cache?.email === connectedEmail ? cache.result : null,
  );
  const [loading, startLoading] = useTransition();

  function reload() {
    startLoading(async () => {
      const next = await loadGmailLinks().catch(
        (): GmailLinksResult => ({ status: "error", message: "Couldn’t reach the server. Check your connection." }),
      );
      cache = next.status === "ok" ? { email: connectedEmail, at: Date.now(), result: next } : null;
      setResult(next);
    });
  }

  useEffect(() => {
    if (!cache || cache.email !== connectedEmail || Date.now() - cache.at > FRESH_FOR) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per visit
  }, [connectedEmail]);

  return { result, loading, reload };
}
