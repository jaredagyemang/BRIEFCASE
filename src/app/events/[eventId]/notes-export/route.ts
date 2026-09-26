import { eventNotesXlsx, exportFileName, XLSX_TYPE, type ExportPlayer } from "@/lib/note-export";
import { createAuthedClient } from "@/lib/supabase/server";

// Every note from an event (typed, voice and handwritten) as an Excel file.
// ?tz= is the coach's time zone, so the Date column matches their clock.

type NoteRow = {
  player_id: string;
  transcript_text: string | null;
  raw_audio_url: string | null;
  note_image_url: string | null;
  created_at: string;
  author: { full_name: string } | null;
  player: {
    first_name: string;
    last_name: string;
    position: string | null;
    grad_year: number | null;
    club_team: string | null;
    email: string | null;
    gpa: string | null;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext<"/events/[eventId]/notes-export">) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) return new Response("Not found", { status: 404 });
  const supabase = await createAuthedClient();

  const [{ data: event }, { data: notes, error }, { data: jerseys }, { data: waiting }] = await Promise.all([
    supabase.from("events").select("name").eq("id", eventId).maybeSingle<{ name: string }>(),
    supabase
      .from("evaluations")
      .select(
        "player_id, transcript_text, raw_audio_url, note_image_url, created_at, author:staff(full_name), player:players!inner(first_name, last_name, position, grad_year, club_team, email, gpa)",
      )
      .eq("event_id", eventId)
      .is("traffic_light_rating", null)
      .order("created_at", { ascending: true })
      .returns<NoteRow[]>(),
    supabase.from("event_players").select("player_id, jersey_number").eq("event_id", eventId),
    supabase
      .from("waiting_notes")
      .select("note_text, written_as, created_at, author:staff(full_name)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .returns<{ note_text: string; written_as: string | null; created_at: string; author: { full_name: string } | null }[]>(),
  ]);
  if (!event) return new Response("Not found", { status: 404 });
  if (error) return new Response("Couldn't load the notes. Try again.", { status: 500 });

  const jerseyOf = new Map((jerseys ?? []).map((j) => [j.player_id, j.jersey_number as string | null]));
  const timeZone = validTimeZone(new URL(request.url).searchParams.get("tz"));
  const formatDate = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const rows = (notes ?? [])
    .filter((n) => n.transcript_text !== null || n.raw_audio_url)
    .sort(
      (a, b) =>
        a.player.last_name.localeCompare(b.player.last_name) ||
        a.player.first_name.localeCompare(b.player.first_name) ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((n) => {
      const player: ExportPlayer = {
        name: `${n.player.first_name} ${n.player.last_name}`,
        jersey: jerseyOf.get(n.player_id) ?? null,
        position: n.player.position,
        grad_year: n.player.grad_year,
        club: n.player.club_team,
        email: n.player.email,
        gpa: n.player.gpa,
      };
      const type = n.note_image_url ? "Handwritten" : n.raw_audio_url ? "Voice" : "Typed";
      const text =
        n.transcript_text === null
          ? "(Voice note, not transcribed yet)"
          : n.transcript_text === ""
            ? "(Voice note, no speech detected)"
            : n.transcript_text;
      return { player, text, type, by: n.author?.full_name ?? "Shared login", date: formatDate.format(new Date(n.created_at)) };
    });

  // Notes still waiting for their player, at the end.
  const waitingRows = (waiting ?? []).map((w) => ({
    player: null,
    text: w.written_as ? `(Written as “${w.written_as}”)\n${w.note_text}` : w.note_text,
    type: "Waiting for a player",
    by: w.author?.full_name ?? "Shared login",
    date: formatDate.format(new Date(w.created_at)),
  }));

  const name = exportFileName(event.name, "notes");
  return new Response(eventNotesXlsx(event.name, [...rows, ...waitingRows]), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function validTimeZone(tz: string | null) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
