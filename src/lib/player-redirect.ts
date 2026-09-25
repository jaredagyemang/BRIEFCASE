import "server-only";
import { notFound, redirect } from "next/navigation";
import { eventPlayerPath } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// Sends an old /players/[id] link to the player's most recent event.
export async function redirectToLatestAppearance(playerId: string, suffix = ""): Promise<never> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_players")
    .select("event:events!inner(id, event_date)")
    .eq("player_id", playerId)
    .returns<{ event: { id: string; event_date: string } }[]>();
  const latest = (data ?? []).sort((a, b) => b.event.event_date.localeCompare(a.event.event_date))[0];
  if (!latest) notFound();
  redirect(eventPlayerPath(latest.event.id, playerId) + suffix);
}
