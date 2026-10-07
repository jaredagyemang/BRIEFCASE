"use client";

import { createContext, useContext } from "react";
import { mailLabels, type MailLabels, type MailProvider } from "@/lib/mail/labels";

// Which mailbox the coach connected (Gmail or Outlook), for The Docket's
// screens to word things right. Gmail unless told otherwise.
const MailContext = createContext<MailProvider>("google");

export function MailProviderScope({ provider, children }: { provider: MailProvider; children: React.ReactNode }) {
  return <MailContext.Provider value={provider}>{children}</MailContext.Provider>;
}

export function useMail(): MailLabels & { provider: MailProvider } {
  const provider = useContext(MailContext);
  return { ...mailLabels(provider), provider };
}
