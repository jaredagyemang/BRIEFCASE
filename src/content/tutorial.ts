// The welcome tutorial shown once to each coach, after they agree to the
// terms (and again from Profile → Replay tutorial). One idea per screen; add,
// remove or reword steps here.

export type TutorialVisual = "welcome" | "events" | "docket" | "swipes" | "lists";
export type TutorialStep = { title: string; body: string; visual: TutorialVisual };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    visual: "welcome",
    title: "Welcome to BRIEFCASE",
    body: "Your recruiting operating system, built for college soccer coaches. Scout players at events and review the film in your inbox, all in one place.",
  },
  {
    visual: "events",
    title: "Events: your staff’s shared side",
    body: "Add the players at a showcase or tournament, then rate them and take notes. Your whole staff sees the same players, ratings and notes.",
  },
  {
    visual: "docket",
    title: "The Docket: your inbox as a feed",
    body: "Connect Gmail or Outlook. BRIEFCASE finds emails with YouTube, Hudl and Veo links and builds an Info Card for each player. Your Docket is yours alone.",
  },
  {
    visual: "swipes",
    title: "Swipe to review",
    body: "Swipe left and right to move between a player’s Info Card and their videos. Swipe up and down for the next player.",
  },
  {
    visual: "lists",
    title: "Shortlist or Share to team",
    body: "☆ Shortlist adds a player to the staff Shortlist: the players you’re pursuing. ↗ Share to team posts them to Shared with team with an optional note. Your whole staff sees both lists.",
  },
];

// One-time hints in The Docket (remembered per coach; see lib/hints.ts).
export const HINTS = {
  swipe: "Swipe left/right for the Info Card and videos, up/down for the next player.",
  lists:
    "☆ Shortlist: the staff’s list of players to pursue. ↗ Share to team: send them to Shared with team, with an optional note.",
} as const;
