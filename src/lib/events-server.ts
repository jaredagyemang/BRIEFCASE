import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Event, EventPlayer } from "@/lib/events";
import type { Player } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

export const EVENT_COLUMNS = "id, name, event_date, status, closed_at, created_at";

export const getEvent = cache(async (eventId: string): Promise<Event> => {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle<Event>();
  if (!data) notFound();
  return data;
});

// A player as seen at one event. 404s if they weren't seen there.
export const getEventPlayer = cache(
  async (eventId: string, playerId: string): Promise<{ player: Player; appearance: EventPlayer }> => {
    const supabase = await createClient();
    const [{ data: player }, { data: appearance }] = await Promise.all([
      supabase.from("players").select("*").eq("id", playerId).maybeSingle<Player>(),
      supabase
        .from("event_players")
        .select("event_id, player_id, jersey_number, traffic_light")
        .eq("event_id", eventId)
        .eq("player_id", playerId)
        .maybeSingle<EventPlayer>(),
    ]);
    if (!player || !appearance) notFound();
    return { player, appearance };
  },
);
