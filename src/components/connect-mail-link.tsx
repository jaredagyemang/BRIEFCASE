"use client";

import { useEffect } from "react";

// The window the Gmail/Outlook sign-in runs in when Briefcase is installed on
// an iPhone or iPad Home Screen (see ConnectMailLink).
export const CONNECT_WINDOW = "briefcase-connect";
const CHANNEL = "briefcase-mail-connect";

// Installed on an iPhone or iPad Home Screen (running full screen, not in Safari).
export function inInstalledIosApp() {
  return typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// "Connect Gmail" / "Connect Outlook". A plain link everywhere, except in the
// installed app on an iPhone or iPad: there, a page from another site
// (Google's or Microsoft's sign-in) can end up in Safari, which doesn't have
// the app's sign-in, so the connection couldn't finish. Opening the sign-in in
// a new window from the tap keeps it inside the app (Apple: windows a Home
// Screen web app opens stay in it), with the app's sign-in. When it's done,
// that window tells the app the result and closes (ConnectReturn).
export function ConnectMailLink({
  href,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !inInstalledIosApp()) return;
        e.preventDefault();
        const url = `${href}${href.includes("?") ? "&" : "?"}window=1`;
        // Must be called right away in the tap, or iOS blocks it.
        const opened = window.open(url, CONNECT_WINDOW);
        if (!opened) window.location.href = href;
      }}
    />
  );
}

// In the app: when the sign-in window reports back, open The Docket with the
// result, just as the plain link's round trip ends.
export function ConnectReturn() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      const { provider, result } = (event.data ?? {}) as { provider?: string; result?: string };
      if ((provider !== "gmail" && provider !== "outlook") || !result || !/^[a-z-]+$/.test(result)) return;
      // A full load, exactly like the end of the plain link's round trip (The
      // Docket shows the result only on arriving with ?gmail= / ?outlook=).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/docket?${provider}=${result}`);
    };
    return () => channel.close();
  }, []);
  return null;
}

// In the sign-in window, at the end: tell the app, then close.
export function reportConnectResult(provider: "gmail" | "outlook", result: string) {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ provider, result });
    channel.close();
  }
  window.close();
}
