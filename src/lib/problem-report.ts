// "Report a problem": the small pieces shared by the form, the server and the
// tests. Nothing here may carry anything about players, emails or notes.

export const REPORT_MAX = 1000;

// The words in Briefcase's own page addresses. Anything else in a path is an
// id (an event, a player, an email…) and is replaced by ":id".
const ROUTE_WORDS = new Set(
  "activity callback card connected docket edit events export film forgot-password inbox login new notes-export players profile read reset-password review scan scan-notes search shared shortlist terms waiting-notes welcome".split(
    " ",
  ),
);

// The page a report came from, as a pattern: the path only (no ?search or
// #fragment, which can hold names), with ids replaced by ":id", e.g.
// "/events/7b0…/players/31c…" → "/events/:id/players/:id".
export function pagePattern(path: string) {
  const clean = String(path).split(/[?#]/)[0].slice(0, 500);
  const parts = clean
    .split("/")
    .filter(Boolean)
    .map((part) => (ROUTE_WORDS.has(part) ? part : ":id"));
  return `/${parts.join("/")}`.slice(0, 200);
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/events\/:id\/players\/:id/, "Player"],
  [/^\/events\/:id\/(scan|scan-notes|waiting-notes)/, "Event (scanning)"],
  [/^\/events\/:id/, "Event"],
  [/^\/events/, "Events"],
  [/^\/docket\/review/, "Reviewing players"],
  [/^\/docket\/card/, "Info card"],
  [/^\/docket\/shortlist/, "Shortlist"],
  [/^\/docket\/shared/, "Shared with team"],
  [/^\/docket\/activity/, "Staff activity"],
  [/^\/docket/, "The Docket"],
  [/^\/profile/, "Profile"],
  [/^\/players/, "Players"],
  [/^\/welcome/, "Welcome"],
];

// A short name for the page, for the notification.
export function pageName(pattern: string) {
  return PAGE_NAMES.find(([re]) => re.test(pattern))?.[1] ?? "Other page";
}

// "390x844@3": the window size and pixel ratio, or null if it doesn't look
// like one.
export function screenSize(value: unknown) {
  return typeof value === "string" && /^\d{2,5}x\d{2,5}(@\d(\.\d{1,2})?)?$/.test(value) ? value : null;
}

// The report's text, or why it can't be sent.
export function checkMessage(value: unknown): { text: string } | { error: string } {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { error: "Write a few words about what went wrong." };
  if (text.length > REPORT_MAX) return { error: `Keep it under ${REPORT_MAX} characters.` };
  return { text };
}
