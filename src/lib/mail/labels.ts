// Words that depend on which mailbox a coach connected, so Gmail and Outlook
// each read naturally on the same screens.

export type MailProvider = "google" | "microsoft";

export const MAIL_LABELS = {
  google: {
    name: "Gmail",
    company: "Google",
    spam: "Spam",
    trash: "your Gmail Trash",
    // "… will be removed from The Docket and moved to …"
    deleteTo: "Trash in your Gmail",
    deleteNote: "Gmail deletes it for good after 30 days.",
    connectPath: "/api/auth/gmail/start",
    // Disconnecting cancels Briefcase's access at Google too.
    disconnectNote: "Briefcase’s access is cancelled at Google.",
  },
  microsoft: {
    name: "Outlook",
    company: "Microsoft",
    spam: "Junk",
    trash: "your Outlook Deleted Items",
    deleteTo: "your Outlook Deleted Items",
    deleteNote: "",
    connectPath: "/api/auth/outlook/start",
    // Microsoft has no way for an app to cancel its own access.
    disconnectNote:
      "To remove Briefcase’s access completely, also remove it at myaccount.microsoft.com (personal accounts) or myapplications.microsoft.com (school accounts).",
  },
} as const;

export type MailLabels = (typeof MAIL_LABELS)[MailProvider];

// What disconnecting does, for its confirmation.
export const disconnectText = (provider: MailProvider, email: string) =>
  provider === "microsoft"
    ? `The Docket will stop reading ${email}. ${MAIL_LABELS.microsoft.disconnectNote} You can connect again anytime.`
    : `The Docket will stop reading ${email}, and Briefcase’s access is cancelled at Google. You can connect again anytime.`;
export const mailLabels = (provider: MailProvider | null | undefined): MailLabels =>
  MAIL_LABELS[provider === "microsoft" ? "microsoft" : "google"];
