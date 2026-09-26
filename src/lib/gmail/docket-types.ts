import type { FoundLink } from "./links";

// Shapes shared by The Docket's server code and its screens.

// A field on the Info card: null when the email doesn't mention it; "stated"
// when the email says it outright; "inferred" when the AI worked it out
// indirectly, shown as "Possibly … — verify, AI may be wrong".
export type InfoField = { value: string; source: "stated" | "inferred" } | null;

export type DocketInfo = {
  name: InfoField;
  position: InfoField;
  grad_year: InfoField;
  club: InfoField;
  gpa: InfoField;
  major: InfoField;
  budget: InfoField;
  // The email is about more than one player; the card shows the first.
  more_players: boolean;
};

export const INFO_FIELDS = ["position", "grad_year", "club", "gpa", "major", "budget"] as const;

export const REPLY_TEMPLATES = ["lets_connect", "not_interested", "wrong_position", "wrong_grad_year"] as const;
export type ReplyTemplate = (typeof REPLY_TEMPLATES)[number];

// Replies that turn the player down also take the email out of the feed.
export const DECLINING: ReplyTemplate[] = ["not_interested", "wrong_position", "wrong_grad_year"];

export type DocketEmail = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string | null;
  subject: string;
  date: string | null;
  links: FoundLink[];
  // null until the AI has read the email.
  info: DocketInfo | null;
  replied: { template: ReplyTemplate; at: string } | null;
  shortlisted: boolean;
};

export type DocketResult =
  | { status: "not_connected" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "ok"; googleEmail: string; canSend: boolean; emails: DocketEmail[]; scanned: number };
