// Player types and display metadata. Enum values mirror the database enums
// in supabase/migrations/20260924000000_v1_schema.sql.

export const LIFECYCLE_STATUSES = [
  { value: "unscreened", label: "Unscreened", pill: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
  { value: "watch_again", label: "Watch Again / Needs Film", pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "needs_staff_review", label: "Needs Staff Review", pill: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { value: "to_be_contacted", label: "To Be Contacted", pill: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { value: "in_communication", label: "In Communication", pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { value: "campus_visit_offered", label: "Campus Visit / Offered", pill: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { value: "committed", label: "Committed", pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "no_longer_pursuing", label: "No Longer Pursuing", pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { value: "archived", label: "Archived / Pass", pill: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400" },
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]["value"];
export type TrafficLight = "green" | "yellow" | "red";

export type Player = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  grad_year: number | null;
  position: string | null;
  club_team: string | null;
  gpa: number | null;
  phone: string | null;
  email: string | null;
  traffic_light: TrafficLight | null;
  lifecycle_status: LifecycleStatus;
  created_at: string;
  updated_at: string;
};

export function statusMeta(status: LifecycleStatus) {
  return LIFECYCLE_STATUSES.find((s) => s.value === status) ?? LIFECYCLE_STATUSES[0];
}

export function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return LIFECYCLE_STATUSES.some((s) => s.value === value);
}

export const TRAFFIC_LIGHTS = [
  { value: "green", label: "Green", dot: "bg-green", ring: "ring-green" },
  { value: "yellow", label: "Yellow", dot: "bg-yellow", ring: "ring-yellow" },
  { value: "red", label: "Red", dot: "bg-red", ring: "ring-red" },
] as const satisfies readonly { value: TrafficLight; label: string; dot: string; ring: string }[];

export const TRAFFIC_LIGHT_DOT: Record<TrafficLight, string> = {
  green: "bg-green",
  yellow: "bg-yellow",
  red: "bg-red",
};

export function isTrafficLight(value: unknown): value is TrafficLight {
  return value === "green" || value === "yellow" || value === "red";
}

export type TaskType = "outreach" | "watch_again" | "request_film" | "follow_up" | "other";


export const TASK_LABELS: Record<TaskType, string> = {
  outreach: "Queued for outreach",
  watch_again: "Watch again",
  request_film: "Film & info requested",
  follow_up: "Follow up",
  other: "Task",
};
