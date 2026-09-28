// How the Events list and an event's player list are sorted, remembered per
// device in a cookie so the list arrives already in order.

export type SortBy = "edited" | "date" | "name";
export type SortDir = "asc" | "desc";
export type Sort = { by: SortBy; dir: SortDir };

export const EVENTS_SORT_COOKIE = "sort-events";
export const PLAYERS_SORT_COOKIE = "sort-players";

export const EVENTS_SORTS: SortBy[] = ["edited", "date", "name"];
export const PLAYERS_SORTS: SortBy[] = ["edited", "name"];

export const SORT_LABEL: Record<SortBy, string> = { edited: "Last edited", date: "Event date", name: "Name" };

// The natural direction for each: newest first for times, A–Z for names.
export const DEFAULT_DIR: Record<SortBy, SortDir> = { edited: "desc", date: "desc", name: "asc" };

export const DEFAULT_SORT: Sort = { by: "edited", dir: "desc" };

export function dirLabel(by: SortBy, dir: SortDir) {
  if (by === "name") return dir === "asc" ? "A–Z" : "Z–A";
  return dir === "desc" ? "Newest first" : "Oldest first";
}

// "edited:desc" → { by: "edited", dir: "desc" }; anything else → the default.
export function parseSort(value: string | undefined, allowed: SortBy[]): Sort {
  const [by, dir] = (value ?? "").split(":");
  if (allowed.includes(by as SortBy) && (dir === "asc" || dir === "desc")) return { by: by as SortBy, dir };
  return DEFAULT_SORT;
}
