"use client";

import { useSyncExternalStore } from "react";

// "Also check Spam" on The Docket's home, remembered on this device (off by
// default), like the time range.
const SPAM_KEY = "briefcase:docket:spam";
const SPAM_EVENT = "briefcase:docket-spam";

function readSpam() {
  try {
    return localStorage.getItem(SPAM_KEY) === "on";
  } catch {
    return false;
  }
}

function subscribeSpam(onChange: () => void) {
  window.addEventListener(SPAM_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SPAM_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveCheckSpam(on: boolean) {
  try {
    if (on) localStorage.setItem(SPAM_KEY, "on");
    else localStorage.removeItem(SPAM_KEY);
  } catch {}
  window.dispatchEvent(new Event(SPAM_EVENT));
}

// null while the page is still being set up (the server can't know).
export function useCheckSpam(): boolean | null {
  return useSyncExternalStore(subscribeSpam, readSpam, () => null);
}

// Outside React (e.g. the first value of a cached result).
export function checkSpamNow() {
  return typeof window !== "undefined" && readSpam();
}
