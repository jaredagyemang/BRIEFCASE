import type { TrafficLight } from "@/lib/players";

export type EventStatus = "active" | "closed";

export type Event = {
  id: string;
  name: string;
  event_date: string; // YYYY-MM-DD
  status: EventStatus;
  closed_at: string | null;
  created_at: string;
};

// A player's appearance at one event: what belongs to that event only.
export type EventPlayer = {
  event_id: string;
  player_id: string;
  jersey_number: string | null;
  traffic_light: TrafficLight | null;
};

// "Jun 14, 2026". Dates are calendar days, so format them as UTC to avoid
// shifting a day in US time zones.
export function formatEventDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function eventPath(eventId: string) {
  return `/events/${eventId}`;
}

export function eventPlayerPath(eventId: string, playerId: string) {
  return `/events/${eventId}/players/${playerId}`;
}
