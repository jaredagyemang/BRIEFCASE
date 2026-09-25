import Link from "next/link";
import { ContactActions } from "@/components/contact-actions";
import { DetailList } from "@/components/detail-list";
import { PlayerNotes, type NoteItem } from "@/components/player-notes";
import { RatingButtons } from "@/components/rating-buttons";
import { StatusSelect } from "@/components/status-select";
import { SwipeTabs } from "@/components/swipe-tabs";
import { findMatchingPlayers } from "@/lib/duplicates-server";
import { eventPath, eventPlayerPath, formatEventDate, type Event } from "@/lib/events";
import { getEvent, getEventPlayer } from "@/lib/events-server";
import { TASK_LABELS, TRAFFIC_LIGHTS, type TaskType, type TrafficLight } from "@/lib/players";
import { getCurrentUser } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

type EvaluationRow = {
  id: string;
  event_id: string;
  traffic_light_rating: TrafficLight | null;
  transcript_text: string | null;
  raw_audio_url: string | null;
  created_at: string;
  rated_by: string | null;
  author: { full_name: string } | null;
};

type Appearance = {
  traffic_light: TrafficLight | null;
  jersey_number: string | null;
  event: Pick<Event, "id" | "name" | "event_date" | "status">;
};

type Rating = { id: string; light: (typeof TRAFFIC_LIGHTS)[number]; by: string; when: string };

const lightFor = (rating: TrafficLight | null) => TRAFFIC_LIGHTS.find((l) => l.value === rating);

export default async function EventPlayerPage({ params, searchParams }: PageProps<"/events/[eventId]/players/[playerId]">) {
  const { eventId, playerId } = await params;
  const tab = (await searchParams).tab === "also" ? "also" : "this";
  const [event, { player, appearance }, currentUser] = await Promise.all([
    getEvent(eventId),
    getEventPlayer(eventId, playerId),
    getCurrentUser(),
  ]);

  const supabase = await createClient();
  const [{ data: evaluations }, { data: appearances }, { data: openTasks }, { data: statusEvent }, possibleDuplicates] =
    await Promise.all([
      // Every rating and note for this player, across all events.
      supabase
        .from("evaluations")
        .select("id, event_id, traffic_light_rating, transcript_text, raw_audio_url, created_at, rated_by, author:staff(full_name)")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<EvaluationRow[]>(),
      supabase
        .from("event_players")
        .select("traffic_light, jersey_number, event:events(id, name, event_date, status)")
        .eq("player_id", playerId)
        .returns<Appearance[]>(),
      supabase
        .from("tasks")
        .select("id, task_type, created_at")
        .eq("player_id", playerId)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      player.status_event_id
        ? supabase.from("events").select("id, name").eq("id", player.status_event_id).maybeSingle<{ id: string; name: string }>()
        : Promise.resolve({ data: null }),
      findMatchingPlayers(supabase, player, player.id),
    ]);

  // Voice notes live in a private bucket, so play them via short-lived links.
  const audioPaths = (evaluations ?? []).flatMap((e) => (e.raw_audio_url ? [e.raw_audio_url] : []));
  const { data: signed } = audioPaths.length
    ? await supabase.storage.from("voice-notes").createSignedUrls(audioPaths, 60 * 60)
    : { data: [] };
  const signedUrl = new Map(signed?.map((s) => [s.path, s.signedUrl]));

  const ratingsFor = (id: string): Rating[] =>
    (evaluations ?? []).flatMap((e) => {
      const light = e.event_id === id ? lightFor(e.traffic_light_rating) : undefined;
      return light ? [{ id: e.id, light, by: e.author?.full_name ?? "Shared login", when: timeAgo(e.created_at) }] : [];
    });
  const notesFor = (id: string): NoteItem[] =>
    (evaluations ?? [])
      .filter((e) => e.event_id === id && (e.transcript_text !== null || e.raw_audio_url))
      .map((e) => ({
        id: e.id,
        text: e.transcript_text,
        audioUrl: e.raw_audio_url ? (signedUrl.get(e.raw_audio_url) ?? null) : null,
        isVoice: Boolean(e.raw_audio_url),
        author: e.author?.full_name ?? null,
        when: timeAgo(e.created_at),
        canEdit: !e.rated_by || e.rated_by === currentUser?.id,
      }));

  const ratings = ratingsFor(eventId);
  const latestLight = lightFor(appearance.traffic_light);
  const others = (appearances ?? [])
    .filter((a) => a.event.id !== eventId)
    .sort((a, b) => b.event.event_date.localeCompare(a.event.event_date));

  const thisEvent = (
    <div className="pb-2">
      <section>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold">Rating</h2>
          {latestLight && ratings[0] && (
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${latestLight.dot}`} />
              {latestLight.label} · {ratings[0].when} · {ratings[0].by}
            </span>
          )}
        </div>
        <RatingButtons eventId={eventId} playerId={playerId} rating={appearance.traffic_light} />
        {ratings.length > 1 && (
          <details className="group mt-3 rounded-2xl bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
              Rating history
              <span className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <RatingHistory ratings={ratings.slice(0, 10)} />
          </details>
        )}
        {openTasks && openTasks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {openTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
                <span className="font-medium">{TASK_LABELS[task.task_type as TaskType]}</span>
                <span className="text-muted">{timeAgo(task.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PlayerNotes eventId={eventId} playerId={playerId} notes={notesFor(eventId)} />
    </div>
  );

  const alsoSeenAt = (
    <div className="space-y-3 pb-2">
      {/* Quick comparison of this player's rating at every event. */}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        {[{ traffic_light: appearance.traffic_light, event }, ...others].map((a) => {
          const light = lightFor(a.traffic_light);
          const current = a.event.id === eventId;
          return (
            <li key={a.event.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={`h-3 w-3 shrink-0 rounded-full ${light ? light.dot : "border border-muted"}`} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {current ? "This event" : a.event.name}
              </span>
              <span className="shrink-0 text-muted">{light ? light.label : "Not rated"}</span>
            </li>
          );
        })}
      </ul>

      <p className="px-1 text-sm text-muted">Ratings and notes from other events. Open an event to change them.</p>

      {/* Side by side on wider screens, stacked on a phone. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((a) => {
          const otherRatings = ratingsFor(a.event.id);
          const otherNotes = notesFor(a.event.id);
          const light = lightFor(a.traffic_light);
          return (
            <article key={a.event.id} className="rounded-2xl bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.event.name}</p>
                  <p className="text-sm text-muted">
                    {formatEventDate(a.event.event_date)}
                    {a.jersey_number && ` · #${a.jersey_number}`}
                    {a.event.status === "closed" && " · Closed"}
                  </p>
                </div>
                <Link
                  href={eventPlayerPath(a.event.id, playerId)}
                  className="shrink-0 rounded-full bg-surface-muted px-3 py-1.5 text-sm font-semibold"
                >
                  Open
                </Link>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 rounded-full ${light ? light.dot : "border border-muted"}`} />
                <span className="font-medium">{light ? light.label : "Not rated"}</span>
                {light && otherRatings[0] && (
                  <span className="text-muted">
                    · {otherRatings[0].by} · {otherRatings[0].when}
                  </span>
                )}
              </p>
              {otherRatings.length > 1 && <RatingHistory ratings={otherRatings.slice(0, 5)} compact />}
              <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Notes</p>
              {otherNotes.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No notes.</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {otherNotes.map((n) => (
                    <li key={n.id} className="rounded-xl bg-surface-muted px-3 py-2 text-sm">
                      {n.text ? (
                        <p className="break-words whitespace-pre-wrap">{n.text}</p>
                      ) : (
                        <p className="text-muted italic">{n.text === "" ? "No speech detected" : "Not transcribed"}</p>
                      )}
                      {n.audioUrl && <audio src={n.audioUrl} controls preload="none" className="mt-2 h-9 w-full" />}
                      <p className="mt-1 text-xs text-muted">
                        {n.isVoice ? "🎙️ Voice · " : ""}
                        {n.author ?? "Shared login"} · {n.when}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href={eventPath(eventId)} className="min-w-0 truncate text-accent-ink">
          ‹ {event.name}
        </Link>
        <Link
          href={`${eventPlayerPath(eventId, playerId)}/edit`}
          className="shrink-0 rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
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
                <Link href={`/players/${d.id}`} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
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
        {/* The avatar ring shows the player's rating at this event. */}
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
          {[appearance.jersey_number && `#${appearance.jersey_number}`, player.position, player.club_team]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-4">
          <StatusSelect eventId={eventId} playerId={playerId} status={player.lifecycle_status} />
        </div>
        {/* The overall status is shared across events; show where it was set. */}
        <p className="mt-1.5 text-xs text-muted">
          {!statusEvent ? null : statusEvent.id === eventId ? (
            "Status set at this event"
          ) : (
            <>
              Status set at{" "}
              <Link href={eventPlayerPath(statusEvent.id, playerId)} className="font-medium text-accent-ink">
                {statusEvent.name}
              </Link>
            </>
          )}
        </p>
        {others.length > 0 && (
          <Link href="?tab=also" scroll={false} className="mt-3 text-sm">
            <span className="text-muted">Also seen at: </span>
            <span className="font-medium text-accent-ink">{others.map((a) => a.event.name).join(", ")}</span>
          </Link>
        )}
      </div>

      <div className="mt-8">
        {others.length > 0 ? (
          <SwipeTabs
            key={tab}
            label="Player sections"
            initialTab={tab}
            tabs={[
              { id: "this", label: "This Event" },
              { id: "also", label: "Also Seen At", count: others.length },
            ]}
          >
            {thisEvent}
            {alsoSeenAt}
          </SwipeTabs>
        ) : (
          thisEvent
        )}
      </div>

      <ContactActions phone={player.phone} email={player.email} />

      <DetailList
        items={[
          { label: "Jersey (this event)", value: appearance.jersey_number && `#${appearance.jersey_number}` },
          { label: "Grad year", value: player.grad_year },
          { label: "Position", value: player.position },
          { label: "Club team", value: player.club_team },
          { label: "GPA", value: player.gpa },
          { label: "Phone", value: player.phone },
          { label: "Email", value: player.email },
        ]}
      />
    </div>
  );
}

function RatingHistory({ ratings, compact }: { ratings: Rating[]; compact?: boolean }) {
  return (
    <ul className={compact ? "mt-2 space-y-1" : "divide-y divide-border border-t border-border"}>
      {ratings.map((r) => (
        <li key={r.id} className={`flex items-center gap-3 text-sm ${compact ? "" : "px-4 py-3"}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.light.dot}`} />
          <span className="font-medium">{r.light.label}</span>
          <span className="min-w-0 flex-1 truncate text-muted">{r.by}</span>
          <span className="shrink-0 text-muted">{r.when}</span>
        </li>
      ))}
    </ul>
  );
}
