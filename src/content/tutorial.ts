// The welcome tutorial shown once to each coach, after they agree to the
// terms (and again from Profile → Replay tutorial). One idea per screen; add,
// remove or reword steps here.

export type TutorialVisual = "welcome" | "events" | "docket" | "swipes" | "replies" | "lists" | "help";
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
    visual: "replies",
    title: "Reply, skip or delete",
    body: "From an Info Card, reply from your own email with a ready-made message: Let’s Connect, Not interested, Wrong position or Wrong grad year. Skip takes a player out of your feed; Delete also moves the email to Trash (Deleted Items in Outlook).",
  },
  {
    visual: "lists",
    title: "Shortlist or Share to team",
    body: "☆ Shortlist adds a player to the staff Shortlist: the players you’re pursuing. ↗ Share to team posts them to Shared with team with an optional note. Your whole staff sees both lists.",
  },
  {
    visual: "help",
    title: "Help on every page",
    body: "If you ever need help on a page, tap the briefcase with the question mark and it will explain what everything does.",
  },
];
