"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectGmail } from "@/app/docket/actions";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { clearDocketCache } from "@/components/use-docket";
import { MAIL_LABELS, disconnectText, mailLabels, type MailProvider } from "@/lib/mail/labels";

// Email on the Profile page: which mailbox The Docket reads (Gmail or
// Outlook, one at a time), disconnecting it (same as in The Docket's ⋯
// menu), switching to the other one, or connecting one.
export function ProfileEmail({ connection }: { connection: { email: string; provider: MailProvider } | null }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"disconnect" | "switch" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectGmail();
        clearDocketCache();
        setSheet(null);
        router.refresh();
      } catch {
        setError("Couldn’t disconnect. Try again.");
      }
    });
  }

  if (!connection) {
    return (
      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-surface" data-mail="none">
        <div className="px-4 py-3.5 text-muted">Not connected</div>
        {/* Plain links, not <Link>: these leave the app for Google's or Microsoft's sign-in. */}
        <a href={MAIL_LABELS.google.connectPath} className="block px-4 py-3.5 font-semibold text-accent-ink">
          Connect Gmail
        </a>
        <a href={MAIL_LABELS.microsoft.connectPath} className="block px-4 py-3.5 font-semibold text-accent-ink">
          Connect Outlook
        </a>
      </div>
    );
  }

  const mail = mailLabels(connection.provider);
  const other = mailLabels(connection.provider === "google" ? "microsoft" : "google");
  return (
    <>
      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-surface" data-mail={connection.provider}>
        <div className="flex justify-between gap-4 px-4 py-3.5">
          <span className="text-muted">{mail.name}</span>
          <span className="truncate font-medium">{connection.email}</span>
        </div>
        <button
          type="button"
          onClick={() => setSheet("switch")}
          className="w-full px-4 py-3.5 text-left font-semibold text-accent-ink"
        >
          Use {other.name} instead
        </button>
        <button
          type="button"
          onClick={() => setSheet("disconnect")}
          className="w-full px-4 py-3.5 text-left font-semibold text-red"
        >
          Disconnect {mail.name}
        </button>
      </div>
      {sheet === "disconnect" && (
        <Sheet onClose={() => !pending && setSheet(null)}>
          <SheetTitle
            title={`Disconnect ${mail.name}?`}
            subtitle={disconnectText(connection.provider, connection.email)}
          />
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton variant="danger" disabled={pending} onClick={disconnect}>
            {pending ? "Disconnecting…" : `Disconnect ${mail.name}`}
          </SheetButton>
          <SheetButton disabled={pending} onClick={() => setSheet(null)}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
      {sheet === "switch" && (
        <Sheet onClose={() => setSheet(null)}>
          <SheetTitle
            title={`Use ${other.name} instead?`}
            subtitle={`Briefcase reads one mailbox at a time. Connecting ${other.name} replaces your ${mail.name} connection (${connection.email}).`}
          />
          <a
            href={other.connectPath}
            className="block w-full rounded-2xl bg-accent py-3.5 text-center font-semibold text-accent-foreground"
          >
            Connect {other.name}
          </a>
          <SheetButton onClick={() => setSheet(null)}>Cancel</SheetButton>
        </Sheet>
      )}
    </>
  );
}
