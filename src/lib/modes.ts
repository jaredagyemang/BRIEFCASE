// The three compartments of the briefcase, in left-to-right order.
export const MODES = [
  { id: "profile", label: "Profile", caption: "Account", root: "/profile" },
  { id: "events", label: "Events", caption: "Events Mode", root: "/events" },
  { id: "docket", label: "The Docket", caption: "Daily Mode", root: "/docket" },
] as const;

export type ModeId = (typeof MODES)[number]["id"];

export function modeIndexFor(pathname: string) {
  if (pathname.startsWith("/profile")) return 0;
  if (pathname.startsWith("/docket")) return 2;
  return 1; // Events, plus old /players links that redirect into events
}
