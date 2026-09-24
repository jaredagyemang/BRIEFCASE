import Link from "next/link";
import { ContactActions } from "@/components/contact-actions";
import { DetailList } from "@/components/detail-list";
import { PlayerNotes, type NoteItem } from "@/components/player-notes";
import { RatingButtons } from "@/components/rating-buttons";
import { StatusSelect } from "@/components/status-select";
import { TASK_LABELS, TRAFFIC_LIGHTS, type TaskType, type TrafficLight } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { findMatchingPlayers } from "@/lib/duplicates-server";
import { getCurrentUser } from "@/lib/staff";
import { timeAgo } from "@/lib/time";
import { getPlayer } from "./data";

type NoteRow = {
  id: string;
  transcript_text: string | null;
  raw_audio_url: string | null;
  created_at: string;
  rated_by: string | null;
  author: { full_name: string } | null;
};

type RatingRow = {
  id: string;
  traffic_light_rating: TrafficLight;
  created_at: string;
  rater: { full_name: string } | null;
};

function lightFor(rating: TrafficLight) {
  return TRAFFIC_LIGHTS.find((l) => l.value === rating)!;
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const [player, currentUser] = await Promise.all([getPlayer(id), getCurrentUser()]);

  const supabase = await createClient();
  const [{ data: ratings }, { data: openTasks }, { data: noteRows }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("id, traffic_light_rating, created_at, rater:staff(full_name)")
      .eq("player_id", id)
      .not("traffic_light_rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<RatingRow[]>(),
    supabase
      .from("tasks")
      .select("id, task_type, created_at")
      .eq("player_id", id)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    // Notes: evaluations with typed/transcribed text or a voice recording.
    supabase
      .from("evaluations")
      .select("id, transcript_text, raw_audio_url, created_at, rated_by, author:staff(full_name)")
      .eq("player_id", id)
      .or("transcript_text.not.is.null,raw_audio_url.not.is.null")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<NoteRow[]>(),
  ]);

  // Voice notes live in a private bucket, so play them via short-lived links.
  const audioPaths = (noteRows ?? []).flatMap((n) => (n.raw_audio_url ? [n.raw_audio_url] : []));
  const { data: signed } = audioPaths.length
    ? await supabase.storage.from("voice-notes").createSignedUrls(audioPaths, 60 * 60)
    : { data: [] };
  const signedUrl = new Map(signed?.map((s) => [s.path, s.signedUrl]));
  const notes: NoteItem[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    text: n.transcript_text,
    audioUrl: n.raw_audio_url ? (signedUrl.get(n.raw_audio_url) ?? null) : null,
    isVoice: Boolean(n.raw_audio_url),
    author: n.author?.full_name ?? null,
    when: timeAgo(n.created_at),
    canEdit: !n.rated_by || n.rated_by === currentUser?.id,
  }));
  const latestEval = ratings?.[0];
  const possibleDuplicates = await findMatchingPlayers(supabase, player, player.id);
  const latestLight = TRAFFIC_LIGHTS.find((l) => l.value === player.traffic_light);

  const details = [
    { label: "Grad year", value: player.grad_year },
    { label: "Position", value: player.position },
    { label: "Club team", value: player.club_team },
    { label: "GPA", value: player.gpa?.toFixed(2) },
    { label: "Phone", value: player.phone },
    { label: "Email", value: player.email },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/players" className="text-accent">
          ‹ Players
        </Link>
        <Link
          href={`/players/${player.id}/edit`}
          className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
        >
          Edit
        </Link>
      </div>

      {possibleDuplicates.length > 0 && (
        <div className="mt-4 rounded-2xl border border-yellow/40 bg-yellow/10 p-4" role="note">
          <p className="font-semibold">⚠️ Possible duplicate</p>
          <p className="mt-0.5 text-sm text-muted">Same name and grad year as:</p>
          <ul className="mt-2 space-y-2">
            {possibleDuplicates.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/players/${d.id}`}
                  className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    {d.detail && <span className="block truncate text-sm text-muted">{d.detail}</span>}
                  </span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center text-center">
        {/* The avatar ring shows the player's latest rating. */}
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-semibold ${
            latestLight ? `ring-4 ring-offset-4 ring-offset-background ${latestLight.ring}` : ""
          }`}
        >
          {player.first_name[0]}
          {player.last_name[0]}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {player.first_name} {player.last_name}
        </h1>
        <p className="mt-0.5 text-muted">
          {[player.position, player.club_team].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-4">
          <StatusSelect playerId={player.id} status={player.lifecycle_status} />
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold">Rating</h2>
          {latestLight && (
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${latestLight.dot}`} />
              {latestLight.label}
              {latestEval && ` · ${timeAgo(latestEval.created_at)}`}
              {latestEval?.rater && ` · ${latestEval.rater.full_name}`}
            </span>
          )}
        </div>
        <RatingButtons playerId={player.id} rating={player.traffic_light} />
        {ratings && ratings.length > 1 && (
          <details className="group mt-3 rounded-2xl bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
              Rating history
              <span className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {ratings.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${lightFor(r.traffic_light_rating).dot}`} />
                  <span className="font-medium">{lightFor(r.traffic_light_rating).label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {r.rater?.full_name ?? "Shared login"}
                  </span>
                  <span className="shrink-0 text-muted">{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {openTasks && openTasks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {openTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium">{TASK_LABELS[task.task_type as TaskType]}</span>
                <span className="text-muted">{timeAgo(task.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlayerNotes playerId={player.id} notes={notes} />

      <ContactActions phone={player.phone} email={player.email} />

      <DetailList items={details} />
    </div>
  );
}
