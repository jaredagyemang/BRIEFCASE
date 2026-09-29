// The welcome tutorial shown once to each coach, after they agree to the
// terms. Placeholder until the real walkthrough is written: add, remove or
// reword steps here.

export type TutorialStep = { title: string; body: string };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to Briefcase",
    body: "Recruiting, in one place: evaluate players at events, and review film that arrives in your inbox.",
  },
  {
    title: "Tutorial coming soon",
    body: "A short walkthrough of Events and The Docket will appear here.",
  },
];
