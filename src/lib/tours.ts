import "server-only";
import { TOUR_KEYS, type TourKey } from "@/content/tours";
import { createClient } from "@/lib/supabase/server";

// Which page tours a coach has seen, remembered per coach (on every device)
// in their login's own settings (Supabase Auth user metadata), so no table or
// migration is needed: { tours: { docket: "2026-10-07T…", events: "…" } }.

async function currentUser() {
  const supabase = await createClient();
  // getUser (not the session's claims), so a tour seen a moment ago on
  // another device is already counted.
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function seenTours(): Promise<TourKey[]> {
  const { user } = await currentUser();
  const tours = (user?.user_metadata?.tours ?? {}) as Record<string, unknown>;
  return TOUR_KEYS.filter((k) => Boolean(tours[k]));
}

export async function markTourSeen(key: TourKey) {
  const { supabase, user } = await currentUser();
  if (!user) return;
  const tours = (user.user_metadata?.tours ?? {}) as Record<string, unknown>;
  if (tours[key]) return;
  const { error } = await supabase.auth.updateUser({ data: { tours: { ...tours, [key]: new Date().toISOString() } } });
  if (error) console.error("Saving a seen page tour failed", error.message);
}

// Profile → Replay page tours: every page's tour shows again.
export async function resetTours() {
  const { supabase, user } = await currentUser();
  if (!user) return;
  const { error } = await supabase.auth.updateUser({ data: { tours: {} } });
  if (error) throw new Error(`Couldn't reset the page tours: ${error.message}`);
}
