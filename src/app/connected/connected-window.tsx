"use client";

import { useEffect } from "react";
import { reportConnectResult } from "@/components/connect-mail-link";

export function ConnectedWindow({ provider, result }: { provider: "gmail" | "outlook"; result: string }) {
  useEffect(() => reportConnectResult(provider, result), [provider, result]);
  const name = provider === "gmail" ? "Gmail" : "Outlook";
  const docket = `/docket?${provider}=${result}`;
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] text-center">
      <p className="text-lg font-semibold">{result === "connected" ? `${name} connected` : `${name} wasn’t connected`}</p>
      <p className="mt-1 text-muted">Going back to Briefcase…</p>
      {/* If this window can't close itself (it stays open in some cases). */}
      <a href={docket} className="mt-6 rounded-2xl bg-accent px-6 py-3.5 font-semibold text-accent-foreground">
        Back to The Docket
      </a>
    </div>
  );
}
