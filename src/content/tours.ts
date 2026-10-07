// Page tours (shown once per coach, the first time they open each page) and
// the "?" help on each page. Each step points at an element marked
// data-tour="…" on that page, and is skipped when that element isn't on
// screen (e.g. no events yet). Keep tours to 5 steps or fewer.

import { LIFECYCLE_STATUSES } from "@/lib/players";

export const TOUR_KEYS = ["docket", "docket-connect", "docket-review", "events", "event", "profile"] as const;
export type TourKey = (typeof TOUR_KEYS)[number];

export type TourStep = { target: string; text: string };
export type PageHelp = { title: string; steps: TourStep[]; details: { term: string; text: string }[] };

export const TOURS: Record<TourKey, PageHelp> = {
  docket: {
    title: "The Docket",
    steps: [
      { target: "docket-search", text: "Search any player from your Docket, even ones you skipped or replied to." },
      { target: "docket-range", text: "Pick how far back to look. The count below shows new players in that time." },
      { target: "docket-start", text: "Start Reviewing opens your feed of Info Cards for that time range." },
      { target: "docket-lists", text: "The Shortlist and Shared with team. Your whole staff sees both lists." },
      { target: "docket-menu", text: "Check for new emails, open your lists, or disconnect your email." },
    ],
    details: [
      {
        term: "Info Cards",
        text: "BRIEFCASE reads each email with film links and fills in what it says: name, position, grad year, club, GPA, major and budget. “Possibly …” means the AI worked it out indirectly, so check it.",
      },
      {
        term: "Also check Spam",
        text: "Looks in your Spam folder too (Junk in Outlook). Only emails the AI judges to be about recruiting come through, labeled “Found in Spam” (“Found in Junk” in Outlook).",
      },
      {
        term: "Search",
        text: "Searches the Info Cards in your Docket by name, sender or subject. If a player isn’t there, “Search Gmail for …” (or Outlook) looks through your whole mailbox.",
      },
      {
        term: "Staff activity",
        text: "Who shortlisted, shared, removed or turned down which player, for the time range you picked. Tap a line to open that player.",
      },
      {
        term: "Your Docket is yours",
        text: "Other coaches can’t see your inbox or your Docket. They see the players you shortlist or share, and the replies that turn a player down.",
      },
    ],
  },
  "docket-connect": {
    title: "The Docket",
    steps: [
      { target: "docket-connect", text: "Connect Gmail or Outlook to bring film from your inbox into The Docket." },
    ],
    details: [
      {
        term: "Connecting your email",
        text: "BRIEFCASE reads emails from the last 30 days that have YouTube, Hudl or Veo links, or Google Docs. It only sends a reply or deletes an email when you tap to. One mailbox at a time; disconnect anytime.",
      },
    ],
  },
  "docket-review": {
    title: "Reviewing players",
    steps: [
      {
        target: "card-name",
        text: "The player’s Info Card, read from the email. Swipe left/right for their videos, up/down for the next player.",
      },
      {
        target: "card-replies",
        text: "Tap a reply to see a ready-made message. Edit it if you like, then send it from your own email.",
      },
      {
        target: "card-lists",
        text: "☆ Shortlist adds them to the staff’s list of players to pursue. ↗ Share to team sends them to Shared with team, with an optional note.",
      },
      {
        target: "card-skip-delete",
        text: "Skip takes them out of your feed. Delete also moves the email to Trash (Deleted Items in Outlook).",
      },
      { target: "feed-back", text: "Head back to The Docket’s home anytime." },
    ],
    details: [
      {
        term: "Replies",
        text: "Let’s Connect, Not interested, Wrong position and Wrong grad year each open a ready-made message you can edit before sending. It goes from your own email, in the same conversation. Not interested, Wrong position and Wrong grad year also take the player out of your feed.",
      },
      {
        term: "Shortlist vs Share to team",
        text: "Both lists are seen by your whole staff, and anyone can remove a player from either. Use the Shortlist for players you’re pursuing; use Share to team to point a player out to everyone, with an optional note.",
      },
      {
        term: "Skip and Delete",
        text: "Skip only hides the player from your feed (you can undo it). Delete asks first, then moves the email to Trash in Gmail (Deleted Items in Outlook) and takes it out of your feed.",
      },
      {
        term: "Videos",
        text: "YouTube and Google Docs open right in the card. Hudl and Veo open in their own apps.",
      },
    ],
  },
  events: {
    title: "Events",
    steps: [
      { target: "events-new", text: "Start a new event when you arrive at a showcase or tournament." },
      { target: "events-search", text: "Search players across every event, including closed ones." },
      { target: "events-sort", text: "Sort events by Last edited, Event date or Name." },
      {
        target: "events-tabs",
        text: "Active Events are in progress. Closed events move to Previous Showcases. Swipe or tap to switch.",
      },
      { target: "events-first", text: "Tap an event to see its players. Your whole staff sees the same events." },
    ],
    details: [
      {
        term: "Shared with your staff",
        text: "Everyone on your staff sees the same events, players, ratings and notes. You can only edit your own ratings and notes.",
      },
      {
        term: "Closing an event",
        text: "Close an event when it’s over; it moves to Previous Showcases. You can reopen it anytime.",
      },
    ],
  },
  event: {
    title: "This event",
    steps: [
      { target: "event-roster", text: "Add roster reads a roster from a photo or a web page and adds the players." },
      {
        target: "event-notes",
        text: "Scan notes reads your handwritten notes from a photo and matches each one to a player.",
      },
      { target: "event-add", text: "Add one player by hand." },
      { target: "event-filters", text: "Filter players by status, or check possible duplicates." },
      { target: "event-first", text: "Tap a player to rate them and take notes." },
    ],
    details: [
      {
        term: "Add roster",
        text: "Choose a photo of a roster sheet or a link to a roster web page. You check every player before they’re added, and BRIEFCASE flags anyone who may already be in the event.",
      },
      {
        term: "Scan notes",
        text: "BRIEFCASE types up each page of handwritten notes and matches every note to a player. You check the matches before saving; notes it can’t match can wait for a player.",
      },
      {
        term: "Statuses",
        // Built from the status dropdown's own list, so the two always match.
        text: `${LIFECYCLE_STATUSES.slice(0, -1)
          .map((s) => s.label)
          .join(", ")} and ${LIFECYCLE_STATUSES.at(-1)!.label}. Set a player’s status on their page.`,
      },
      {
        term: "Export notes",
        text: "Downloads everyone’s notes for this event as a spreadsheet.",
      },
    ],
  },
  profile: {
    title: "Profile",
    steps: [
      { target: "profile-name", text: "Your name appears next to the ratings you make." },
      { target: "profile-email", text: "Connect, switch or disconnect the email The Docket reads." },
      { target: "profile-appearance", text: "Choose Light, Dark, or Auto to match your phone." },
      { target: "profile-replay", text: "Replay the tutorial or these page tours anytime." },
    ],
    details: [
      {
        term: "Email",
        text: "The Docket reads one mailbox at a time, Gmail or Outlook. Use … instead switches to the other; Disconnect stops The Docket reading it.",
      },
      {
        term: "Replay page tours",
        text: "Shows each page’s quick tour again the next time you open that page.",
      },
    ],
  },
};
