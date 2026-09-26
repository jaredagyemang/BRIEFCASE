import { NotesScanner, type ScanPlayer } from "@/components/notes-scanner";
import { getEvent } from "@/lib/events-server";
import type { Player } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Row = {
  jersey_number: string | null;
  player: Pick<Player, "id" | "first_name" | "last_name" | "position" | "grad_year" | "club_team" | "email" | "gpa">;
};

// Bulk capture of handwritten notes for this event's players.
export default async function ScanNotesPage({ params }: PageProps<"/events/[eventId]/scan-notes">) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_players")
    .select("jersey_number, player:players!inner(id, first_name, last_name, position, grad_year, club_team, email, gpa)")
    .eq("event_id", eventId)
    .returns<Row[]>();

  const players: ScanPlayer[] = (data ?? [])
    .sort(
      (a, b) =>
        a.player.last_name.localeCompare(b.player.last_name) || a.player.first_name.localeCompare(b.player.first_name),
    )
    .map(({ jersey_number, player: p }) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      jersey: jersey_number,
      position: p.position,
      grad_year: p.grad_year,
      club: p.club_team,
      email: p.email,
      gpa: p.gpa,
    }));

  return <NotesScanner eventId={event.id} eventName={event.name} players={players} />;
}
