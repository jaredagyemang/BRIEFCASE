import { WaitingNotes, type WaitingNote } from "@/components/waiting-notes";
import type { NotePlayer } from "@/app/events/waiting-notes-actions";
import { getEvent } from "@/lib/events-server";
import type { Player } from "@/lib/players";
import { getCurrentUser } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

type NoteRow = {
  id: string;
  note_text: string;
  note_image_url: string | null;
  written_as: string | null;
  written_by: string | null;
  created_at: string;
  author: { full_name: string } | null;
};

type PlayerRow = {
  jersey_number: string | null;
  player: Pick<Player, "id" | "first_name" | "last_name" | "position" | "grad_year" | "club_team" | "email" | "gpa">;
};

// Handwritten notes kept with the event until their player is added: assign
// each one to a player (or add the player here), or discard it.
export default async function WaitingNotesPage({ params }: PageProps<"/events/[eventId]/waiting-notes">) {
  const { eventId } = await params;
  const [event, currentUser] = await Promise.all([getEvent(eventId), getCurrentUser()]);
  const supabase = await createClient();

  const [{ data: notes }, { data: roster }] = await Promise.all([
    supabase
      .from("waiting_notes")
      .select("id, note_text, note_image_url, written_as, written_by, created_at, author:staff(full_name)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .returns<NoteRow[]>(),
    supabase
      .from("event_players")
      .select("jersey_number, player:players!inner(id, first_name, last_name, position, grad_year, club_team, email, gpa)")
      .eq("event_id", eventId)
      .returns<PlayerRow[]>(),
  ]);

  const paths = [...new Set((notes ?? []).flatMap((n) => (n.note_image_url ? [n.note_image_url] : [])))];
  const { data: signed } = paths.length
    ? await supabase.storage.from("note-photos").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const photoUrl = new Map(signed?.map((s) => [s.path, s.signedUrl]));

  const players: NotePlayer[] = (roster ?? [])
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

  const waiting: WaitingNote[] = (notes ?? []).map((n) => {
    const written = n.written_as?.match(/^(?:#(\S+))?\s*(.*)$/);
    return {
      id: n.id,
      text: n.note_text,
      photoUrl: n.note_image_url ? (photoUrl.get(n.note_image_url) ?? null) : null,
      writtenAs: n.written_as,
      writtenJersey: written?.[1] ?? null,
      writtenName: written?.[2]?.trim() || null,
      author: n.author?.full_name ?? null,
      when: timeAgo(n.created_at),
      canEdit: !n.written_by || n.written_by === currentUser?.id,
    };
  });

  return <WaitingNotes eventId={event.id} eventName={event.name} notes={waiting} players={players} />;
}
