"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectGmail } from "@/app/docket/actions";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { clearDocketCache } from "@/components/use-docket";

// Gmail on the Profile page: which address The Docket reads, and
// disconnecting it (same as in The Docket's ⋯ menu), or connecting one.
export function ProfileGmail({ connectedEmail }: { connectedEmail: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectGmail();
        clearDocketCache();
        setConfirming(false);
        router.refresh();
      } catch {
        setError("Couldn’t disconnect. Try again.");
      }
    });
  }

  if (!connectedEmail) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-3xl bg-surface px-4 py-3.5" data-gmail="none">
        <span className="text-muted">Not connected</span>
        {/* A plain link, not <Link>: this leaves the app for Google's sign-in. */}
        <a href="/api/auth/gmail/start" className="font-semibold text-accent-ink">
          Connect Gmail
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-surface" data-gmail="connected">
        <div className="flex justify-between gap-4 px-4 py-3.5">
          <span className="text-muted">Connected</span>
          <span className="truncate font-medium">{connectedEmail}</span>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full px-4 py-3.5 text-left font-semibold text-red"
        >
          Disconnect Gmail
        </button>
      </div>
      {confirming && (
        <Sheet onClose={() => !pending && setConfirming(false)}>
          <SheetTitle
            title="Disconnect Gmail?"
            subtitle={`The Docket will stop reading ${connectedEmail}, and Briefcase’s access is cancelled at Google. You can connect again anytime.`}
          />
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton variant="danger" disabled={pending} onClick={disconnect}>
            {pending ? "Disconnecting…" : "Disconnect Gmail"}
          </SheetButton>
          <SheetButton disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
    </>
  );
}
