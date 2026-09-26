// The three compartments of the briefcase, in left-to-right order. The Docket,
// used most day to day, sits in the middle.
export const MODES = [
  { id: "profile", label: "Profile", caption: "Account", root: "/profile" },
  { id: "docket", label: "The Docket", caption: "Daily Mode", root: "/docket" },
  { id: "events", label: "Events", caption: "Events Mode", root: "/events" },
] as const;

export type ModeId = (typeof MODES)[number]["id"];

export function modeIndexFor(pathname: string) {
  if (pathname.startsWith("/profile")) return 0;
  if (pathname.startsWith("/docket")) return 1;
  return 2; // Events, plus old /players links that redirect into events
}
