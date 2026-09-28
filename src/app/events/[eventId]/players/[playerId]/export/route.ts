import { formatEventDate } from "@/lib/events";
import { playerFileName, playerXlsx, validTimeZone, XLSX_TYPE, type PlayerEventHistory } from "@/lib/note-export";
import { TRAFFIC_LIGHTS, statusMeta, type Player, type TrafficLight } from "@/lib/players";
import { createAuthedClient } from "@/lib/supabase/server";

// One player as an Excel file: their details, and their rating and every
// note at this event; with ?history=1, also every other event they were seen
// at. Photos and recordings stay in Briefcase: only text goes in the file.
// ?tz= is the coach's time zone, so dates match their clock.

type Appearance = {
  jersey_number: string | null;
  traffic_light: TrafficLight | null;
  event: { id: string; name: string; event_date: string };
};

type Evaluation = {
  event_id: string;
  traffic_light_rating: TrafficLight | null;
  transcript_text: string | null;
  raw_audio_url: string | null;
  note_image_url: string | null;
  created_at: string;
  author: { full_name: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lightLabel = (light: TrafficLight | null) => TRAFFIC_LIGHTS.find((l) => l.value === light)?.label ?? null;

export async function GET(request: Request, { params }: RouteContext<"/events/[eventId]/players/[playerId]/export">) {
  const { eventId, playerId } = await params;
  if (!UUID.test(eventId) || !UUID.test(playerId)) return new Response("Not found", { status: 404 });
  const search = new URL(request.url).searchParams;
  const withHistory = search.get("history") === "1";
  const supabase = await createAuthedClient();

  const [{ data: player }, { data: appearances, error }] = await Promise.all([
    supabase.from("players").select("*").eq("id", playerId).maybeSingle<Player>(),
    supabase
      .from("event_players")
      .select("jersey_number, traffic_light, event:events!inner(id, name, event_date)")
      .eq("player_id", playerId)
      .returns<Appearance[]>(),
  ]);
  const here = appearances?.find((a) => a.event.id === eventId);
  if (!player || !here) return new Response("Not found", { status: 404 });
  if (error) return new Response("Couldn't load the player. Try again.", { status: 500 });

  // This event first, then (if asked) the others, newest first.
  const events = [
    here,
    ...(withHistory
      ? appearances!
          .filter((a) => a.event.id !== eventId)
          .sort((a, b) => b.event.event_date.localeCompare(a.event.event_date))
      : []),
  ];

  const { data: evaluations, error: evalError } = await supabase
    .from("evaluations")
    .select(
      "event_id, traffic_light_rating, transcript_text, raw_audio_url, note_image_url, created_at, author:staff(full_name)",
    )
    .eq("player_id", playerId)
    .in(
      "event_id",
      events.map((e) => e.event.id),
    )
    .order("created_at", { ascending: true })
    .returns<Evaluation[]>();
  if (evalError) return new Response("Couldn't load the notes. Try again.", { status: 500 });

  const timeZone = validTimeZone(search.get("tz"));
  const formatDate = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const history: PlayerEventHistory[] = events.map((a) => ({
    name: a.event.name,
    date: formatEventDate(a.event.event_date),
    jersey: a.jersey_number,
    rating: lightLabel(a.traffic_light),
    entries: (evaluations ?? [])
      .filter(
        (e) => e.event_id === a.event.id && (e.traffic_light_rating || e.transcript_text !== null || e.raw_audio_url),
      )
      .map((e) => {
        const by = e.author?.full_name ?? "Shared login";
        const date = formatDate.format(new Date(e.created_at));
        if (e.traffic_light_rating) {
          return { date, type: "Rating", by, rating: lightLabel(e.traffic_light_rating), note: null };
        }
        if (e.raw_audio_url) {
          const text =
            e.transcript_text === null
              ? "(Not transcribed yet)"
              : e.transcript_text === ""
                ? "(No speech detected)"
                : e.transcript_text;
          return { date, type: "Voice", by, rating: null, note: `${text}\n\n(Voice recording available in Briefcase)` };
        }
        if (e.note_image_url) {
          return {
            date,
            type: "Handwritten",
            by,
            rating: null,
            note: `${e.transcript_text}\n\n(Photo of the handwritten page available in Briefcase)`,
          };
        }
        return { date, type: "Typed", by, rating: null, note: e.transcript_text };
      }),
  }));

  const name = `${player.first_name} ${player.last_name}`;
  const file = playerXlsx(
    {
      name,
      jersey: here.jersey_number,
      position: player.position,
      grad_year: player.grad_year,
      club: player.club_team,
      email: player.email,
      phone: player.phone,
      gpa: player.gpa,
      status: statusMeta(player.lifecycle_status).label,
    },
    history,
    formatDate.format(new Date()),
  );

  return new Response(file, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${playerFileName(name, here.event.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
