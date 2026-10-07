"use client";

import { useSyncExternalStore } from "react";

// In Safari on an iPhone or iPad (not the installed app). Links in emails
// always open in Safari, and the installed app keeps its own sign-in.
const inIosSafari = () => (navigator as Navigator & { standalone?: boolean }).standalone === false;
const subscribe = () => () => {};

// After a password reset (from the emailed link, so in Safari): a coach who
// uses Briefcase from the Home Screen still has to sign in there.
export function HomeScreenNote() {
  const show = useSyncExternalStore(subscribe, inIosSafari, () => false);
  if (!show) return null;
  return (
    <span className="mt-1 block font-normal">
      Use Briefcase from your Home Screen? Open it there and sign in with your new password.
    </span>
  );
}
