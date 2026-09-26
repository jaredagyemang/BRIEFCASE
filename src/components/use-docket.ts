"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { extractInfoCardsAction, loadDocketAction } from "@/app/docket/actions";
import type { DocketEmail, DocketResult } from "@/lib/gmail/docket-types";

// The last result, kept while the app is open so flipping back to The Docket
// shows the feed straight away instead of reading Gmail again. Tied to the
// connected address, so a different account never sees someone else's feed.
let cache: { email: string; at: number; result: DocketResult } | null = null;
const FRESH_FOR = 2 * 60 * 1000;

export function clearDocketCache() {
  cache = null;
}

// How many emails the AI reads per request (in feed order, so the players at
// the top fill in first).
const EXTRACT_BATCH = 4;

export function useDocket(connectedEmail: string) {
  const [result, setResultState] = useState<DocketResult | null>(() =>
    cache?.email === connectedEmail ? cache.result : null,
  );
  const [loading, startLoading] = useTransition();
  // Emails the AI is reading right now, and ones it couldn't read.
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const attempted = useRef(new Set<string>());

  const setResult = useCallback(
    (next: DocketResult | ((prev: DocketResult | null) => DocketResult | null)) => {
      setResultState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        cache = value?.status === "ok" ? { email: connectedEmail, at: cache?.at ?? Date.now(), result: value } : null;
        return value;
      });
    },
    [connectedEmail],
  );

  function reload() {
    startLoading(async () => {
      const next = await loadDocketAction().catch(
        (): DocketResult => ({ status: "error", message: "Couldn’t reach the server. Check your connection." }),
      );
      attempted.current.clear();
      setFailed(new Set());
      cache = next.status === "ok" ? { email: connectedEmail, at: Date.now(), result: next } : null;
      setResultState(next);
    });
  }

  useEffect(() => {
    if (!cache || cache.email !== connectedEmail || Date.now() - cache.at > FRESH_FOR) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per visit
  }, [connectedEmail]);

  // Fill in Info cards the AI hasn't read yet, a few at a time.
  useEffect(() => {
    if (result?.status !== "ok" || reading.size > 0) return;
    const next = result.emails.filter((e) => !e.info && !attempted.current.has(e.id)).slice(0, EXTRACT_BATCH);
    if (next.length === 0) return;
    const ids = next.map((e) => e.id);
    ids.forEach((id) => attempted.current.add(id));
    setReading(new Set(ids));
    extractInfoCardsAction(ids)
      .catch(() => ({}) as Record<string, null>)
      .then((cards) => {
        setResult((prev) =>
          prev?.status === "ok"
            ? { ...prev, emails: prev.emails.map((e) => (cards[e.id] ? { ...e, info: cards[e.id] } : e)) }
            : prev,
        );
        setFailed((prev) => new Set([...prev, ...ids.filter((id) => !cards[id])]));
        setReading(new Set());
      });
  }, [result, reading, setResult]);

  function retryInfo(id: string) {
    attempted.current.delete(id);
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Nudge the effect above to pick it up.
    setResult((prev) => (prev ? { ...prev } : prev));
  }

  function updateEmail(id: string, patch: Partial<DocketEmail>) {
    setResult((prev) =>
      prev?.status === "ok" ? { ...prev, emails: prev.emails.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : prev,
    );
  }

  function removeEmail(id: string) {
    setResult((prev) => (prev?.status === "ok" ? { ...prev, emails: prev.emails.filter((e) => e.id !== id) } : prev));
  }

  function restoreEmail(email: DocketEmail, index: number) {
    setResult((prev) => {
      if (prev?.status !== "ok" || prev.emails.some((e) => e.id === email.id)) return prev;
      const emails = [...prev.emails];
      emails.splice(Math.min(index, emails.length), 0, email);
      return { ...prev, emails };
    });
  }

  return { result, loading, reload, reading, failed, retryInfo, updateEmail, removeEmail, restoreEmail };
}
