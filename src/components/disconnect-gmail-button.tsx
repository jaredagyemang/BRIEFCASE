"use client";

import { useState, useTransition } from "react";
import { disconnectGmail } from "@/app/docket/actions";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { clearGmailLinksCache } from "@/components/gmail-links";

export function DisconnectGmailButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectGmail();
        clearGmailLinksCache();
        setOpen(false);
      } catch {
        setError("Couldn’t disconnect. Try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
      >
        Disconnect
      </button>
      {open && (
        <Sheet onClose={() => !pending && setOpen(false)}>
          <SheetTitle
            title="Disconnect Gmail?"
            subtitle={`The Docket will stop reading ${email}, and Briefcase’s access is cancelled at Google. You can connect again anytime.`}
          />
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton variant="danger" disabled={pending} onClick={confirm}>
            {pending ? "Disconnecting…" : "Disconnect Gmail"}
          </SheetButton>
          <SheetButton disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
    </>
  );
}
