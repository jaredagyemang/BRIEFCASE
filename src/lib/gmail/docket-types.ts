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
  // Is this a recruiting email at all? "no" emails are left out of The Docket;
  // "unsure" ones are shown with a warning so the coach can decide.
  recruiting: "yes" | "no" | "unsure";
};

// Info cards saved before the recruiting check existed are read again.
export const isCurrentInfo = (info: DocketInfo | null | undefined): info is DocketInfo =>
  Boolean(info && typeof info === "object" && "recruiting" in info);

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
  | { status: "ok"; googleEmail: string; canSend: boolean; canDelete: boolean; emails: DocketEmail[]; scanned: number };

// The Docket's time ranges (all within the 30 days read from Gmail).
export const RANGES = [
  { id: "24h", label: "24 hours", phrase: "the last 24 hours", hours: 24 },
  { id: "3d", label: "3 days", phrase: "the last 3 days", hours: 72 },
  { id: "1w", label: "1 week", phrase: "the last week", hours: 168 },
  { id: "2w", label: "2 weeks", phrase: "the last 2 weeks", hours: 336 },
  { id: "30d", label: "30 days", phrase: "the last 30 days", hours: 720 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];
export const DEFAULT_RANGE: RangeId = "3d";
export const rangeFor = (id: string | null | undefined) => RANGES.find((r) => r.id === id) ?? RANGES.find((r) => r.id === DEFAULT_RANGE)!;
export const inRange = (email: { date: string | null }, hours: number, now = Date.now()) =>
  email.date !== null && now - Date.parse(email.date) <= hours * 3600_000;
