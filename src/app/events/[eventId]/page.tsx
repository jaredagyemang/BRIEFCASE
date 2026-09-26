import Link from "next/link";
import { Suspense } from "react";
import { EventStatusButton } from "@/components/event-status-button";
import { ExportNotesLink } from "@/components/export-notes-link";
import { SearchBox } from "@/components/search-box";
import { StatusPill } from "@/components/status-pill";
import { describePlayer, duplicateIds } from "@/lib/duplicates";
import { eventPath, eventPlayerPath, formatEventDate } from "@/lib/events";
import { getEvent } from "@/lib/events-server";
import { LIFECYCLE_STATUSES, TRAFFIC_LIGHT_DOT, isLifecycleStatus, type Player, type TrafficLight } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Row = {
  jersey_number: string | null;
  traffic_light: TrafficLight | null;
  player: Pick<
    Player,
    "id" | "first_name" | "last_name" | "grad_year" | "position" | "club_team" | "lifecycle_status"
  >;
};

export default async function EventPage({ params, searchParams }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  const status = isLifecycleStatus(query.status) ? query.status : null;
  const showDuplicates = query.status === "duplicates";
  const added = typeof query.added === "string" ? Number(query.added) : 0;

  const event = await getEvent(eventId);
  const supabase = await createClient();

  const [{ data, error }, { data: allPlayers }, { count: waitingNotes }] = await Promise.all([
    supabase
      .from("event_players")
      .select("jersey_number, traffic_light, player:players!inner(id, first_name, last_name, grad_year, position, club_team, lifecycle_status)")
      .eq("event_id", eventId)
      .returns<Row[]>(),
    // Possible duplicates across every player, so they're flagged here too.
    supabase
      .from("players")
      .select("id, first_name, last_name, grad_year")
      .returns<Pick<Player, "id" | "first_name" | "last_name" | "grad_year">[]>(),
    // Handwritten notes still waiting for their player to be added.
    supabase.from("waiting_notes").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);
  const duplicates = duplicateIds(allPlayers ?? []);
  const everyone = data ?? [];
  const eventDuplicates = everyone.filter((r) => duplicates.has(r.player.id));

  // Filters: default view hides archived players; Duplicates shows flagged
  // players whatever their status.
  const rows = (showDuplicates ? eventDuplicates : everyone)
    .filter((r) =>
      showDuplicates ? true : status ? r.player.lifecycle_status === status : r.player.lifecycle_status !== "archived",
    )
    .filter((r) => {
      if (!q) return true;
      const p = r.player;
      return [p.first_name, p.last_name, `${p.first_name} ${p.last_name}`, p.club_team, p.position, r.jersey_number]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    })
    .sort(
      (a, b) =>
        a.player.last_name.localeCompare(b.player.last_name) || a.player.first_name.localeCompare(b.player.first_name),
    );

  const selectedChip = showDuplicates ? "duplicates" : status;
  const chips = [
    { value: null, label: "Active" },
    ...(eventDuplicates.length > 0 ? [{ value: "duplicates", label: `⚠️ Duplicates (${eventDuplicates.length})` }] : []),
    ...LIFECYCLE_STATUSES,
  ];
  function chipHref(value: string | null) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (value) next.set("status", value);
    const s = next.toString();
    return s ? `${eventPath(eventId)}?${s}` : eventPath(eventId);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/events" className="text-accent-ink">
          ‹ Events
        </Link>
        <div className="flex gap-2">
          <Link href={`${eventPath(eventId)}/edit`} className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold">
            Edit
          </Link>
          <EventStatusButton eventId={eventId} status={event.status} />
        </div>
      </div>

      <div className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-muted">
            {formatEventDate(event.event_date)} · {everyone.length} player{everyone.length === 1 ? "" : "s"}
            {event.status === "closed" && (
              <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">Closed</span>
            )}
          </p>
          <ExportNotesLink href={`${eventPath(eventId)}/notes-export`} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`${eventPath(eventId)}/scan`}
          className="rounded-2xl bg-surface-muted py-3 text-center text-sm font-semibold"
        >
          📷 Scan roster
        </Link>
        <Link
          href={`${eventPath(eventId)}/scan?source=link`}
          className="rounded-2xl bg-surface-muted py-3 text-center text-sm font-semibold"
        >
          🔗 Paste link
        </Link>
        <Link
          href={`${eventPath(eventId)}/scan-notes`}
          className="rounded-2xl bg-surface-muted py-3 text-center text-sm font-semibold"
        >
          ✍️ Scan notes
        </Link>
        <Link
          href={`${eventPath(eventId)}/players/new`}
          className="rounded-2xl bg-accent py-3 text-center text-sm font-semibold text-accent-foreground"
        >
          + Add player
        </Link>
      </div>

      {(waitingNotes ?? 0) > 0 && (
        <Link
          href={`${eventPath(eventId)}/waiting-notes`}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-yellow/10 px-4 py-3 text-sm font-medium"
        >
          <span>
            ⏳ {waitingNotes} note{waitingNotes === 1 ? "" : "s"} waiting for a player
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}

      {added > 0 && (
        <p className="mt-4 rounded-2xl bg-green/15 px-4 py-3 text-sm font-medium" role="status">
          ✅ Added {added} player{added === 1 ? "" : "s"} from the roster.
        </p>
      )}

      <div className="mt-4">
        <Suspense>
          <SearchBox placeholder="Search this event" label="Search this event" />
        </Suspense>
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {chips.map((chip) => {
          const active = chip.value === selectedChip;
          return (
            <Link
              key={chip.value ?? "active"}
              href={chipHref(chip.value)}
              scroll={false}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "bg-foreground text-background" : "bg-surface-muted text-muted"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <p className="mt-6 rounded-3xl bg-red/10 p-6 text-red">Couldn&apos;t load players: {error.message}</p>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-surface p-10 text-center">
          <p className="text-4xl">🏃</p>
          <p className="mt-3 font-semibold">{q || selectedChip ? "No matching players" : "No players yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {q || selectedChip ? "Try a different search or filter." : "Scan a roster or add players you see here."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-3xl bg-surface">
          {rows.map(({ player: p, traffic_light, jersey_number }) => (
            <li key={p.id}>
              <Link
                href={eventPlayerPath(eventId, p.id)}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-surface-muted sm:hover:bg-surface-muted"
              >
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold">
                  {p.first_name[0]}
                  {p.last_name[0]}
                  {traffic_light && (
                    <span
                      className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${TRAFFIC_LIGHT_DOT[traffic_light]}`}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {describePlayer({ ...p, jersey_number }) || "No details yet"}
                  </p>
                  {duplicates.has(p.id) && (
                    <span
                      title="Possible duplicate: same name and grad year as another player"
                      className="mt-1 inline-block rounded-full bg-yellow/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-yellow-700 dark:text-yellow"
                    >
                      ⚠️ Duplicate?
                    </span>
                  )}
                </div>
                <StatusPill status={p.lifecycle_status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
