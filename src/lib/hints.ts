import "server-only";
import { createClient } from "@/lib/supabase/server";

// One-time hints in The Docket, remembered per coach (on every device) in
// their login's own settings (Supabase Auth user metadata), so no table or
// migration is needed: { hints: { swipe: "2026-10-07T…", lists: "…" } }.

export const HINT_KEYS = ["swipe", "lists"] as const;
export type HintKey = (typeof HINT_KEYS)[number];

export async function seenHints(): Promise<HintKey[]> {
  const supabase = await createClient();
  // getUser (not the session's claims), so a hint dismissed a moment ago on
  // another device is already counted.
  const { data } = await supabase.auth.getUser();
  const hints = (data.user?.user_metadata?.hints ?? {}) as Record<string, unknown>;
  return HINT_KEYS.filter((k) => Boolean(hints[k]));
}

export async function markHintSeen(key: HintKey) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const hints = (data.user.user_metadata?.hints ?? {}) as Record<string, unknown>;
  if (hints[key]) return;
  const { error } = await supabase.auth.updateUser({ data: { hints: { ...hints, [key]: new Date().toISOString() } } });
  if (error) console.error("Saving a seen hint failed", error.message);
}
