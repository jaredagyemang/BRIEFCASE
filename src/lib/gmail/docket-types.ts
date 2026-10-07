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
  // On "Shared with team" (separate from the Shortlist).
  shared: boolean;
  // In Gmail's Spam ("Also check Spam"), shown as "Found in Spam".
  inSpam: boolean;
};

export type DocketResult =
  | { status: "not_connected" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      googleEmail: string;
      // Which mailbox: Gmail or Outlook.
      provider: "google" | "microsoft";
      canSend: boolean;
      canDelete: boolean;
      emails: DocketEmail[];
      // From Spam, still to be checked by the AI (see checkSpamEmails): only
      // the id and date until then.
      spamPending: { id: string; date: string | null }[];
      scanned: number;
    };

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

// Longest note a coach can add when sharing an Info card with the team (the
// database allows the same).
export const SHARE_NOTE_MAX = 500;

// --- Search -----------------------------------------------------------------------

// Where a card stands in this coach's Docket, shown on search results and on
// a card opened from search.
export type CardStatus =
  | { kind: "feed" } // in the feed now
  | { kind: "skipped" } // skipped (or deleted to Gmail Trash)
  | { kind: "declined"; template: ReplyTemplate } // turned down with a reply
  | { kind: "not_recruiting" } // the AI judged it not a recruiting email
  | { kind: "older" }; // older than the feed's 30 days

export type SearchResult = {
  id: string;
  // null until the AI has read the email (e.g. just found in Gmail).
  info: DocketInfo | null;
  from: string | null;
  subject: string | null;
  date: string | null;
  status: CardStatus;
  shortlisted: boolean;
  shared: boolean;
};

// One card opened on its own (from search).
export type CardResult =
  | { status: "not_connected" }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ok"; email: DocketEmail; card: CardStatus; inTrash: boolean; canSend: boolean; canDelete: boolean };

export type GmailSearchResult =
  | { status: "ok"; results: SearchResult[] }
  | { status: "expired" }
  | { status: "error"; message: string };

// Search text as typed → safe to use in a database or Gmail query: letters,
// numbers, spaces and a few name characters only.
export function cleanSearch(q: string) {
  return q
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// --- Staff activity ------------------------------------------------------------------

export type ActivityAction = "shortlisted" | "unshortlisted" | "shared" | "unshared" | "replied";

// One line of staff activity: only the fact that it happened, never anything
// from the email.
export type ActivityEntry = {
  id: string;
  // The coach who did it ("You" for the signed-in coach).
  actor: string;
  action: ActivityAction;
  template: ReplyTemplate | null;
  player: string | null;
  note: string | null;
  at: string;
  // Where tapping it goes: this coach's own Info card, or the entry's page.
  href: string;
};

export type ActivityPage =
  | { status: "ok"; entries: ActivityEntry[]; more: boolean }
  | { status: "error"; message: string };

export const ACTIVITY_PAGE_SIZE = 20;

// --- Shortlist and Share to team ---------------------------------------------------

// Adding to the Shortlist or Shared with team: done, or already there (the
// same email, or the same player from a different email), with who added it.
export type ListResult =
  | { status: "done" }
  | {
      status: "already";
      // "same": this email is already on the list. "name": a player with the
      // same name (and grad year, when both say) is, from another email.
      match: "same" | "name";
      player: string | null;
      // "you", or the coach's name.
      by: string;
      at: string;
      note: string | null;
    };

// A name for matching: no accents, capitals, punctuation or extra spaces.
export const matchName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Same player on two Info cards: the same name, and the same grad year when
// both cards have one.
export function samePlayer(a: DocketInfo | null | undefined, b: DocketInfo | null | undefined) {
  const nameA = a?.name?.value ? matchName(a.name.value) : "";
  const nameB = b?.name?.value ? matchName(b.name.value) : "";
  if (!nameA || nameA !== nameB) return false;
  const yearA = a?.grad_year?.value?.match(/\d{4}/)?.[0];
  const yearB = b?.grad_year?.value?.match(/\d{4}/)?.[0];
  return !yearA || !yearB || yearA === yearB;
}
