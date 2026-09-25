import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SwipeTabs } from "@/components/swipe-tabs";
import { describePlayer } from "@/lib/duplicates";
import { eventPath, eventPlayerPath, formatEventDate, type Event } from "@/lib/events";
import { EVENT_COLUMNS } from "@/lib/events-server";
import { TRAFFIC_LIGHT_DOT, type Player, type TrafficLight } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type EventWithCount = Event & { event_players: { count: number }[] };

type SearchResult = Pick<Player, "id" | "first_name" | "last_name" | "grad_year" | "position" | "club_team"> & {
  event_players: { traffic_light: TrafficLight | null; event: Pick<Event, "id" | "name" | "event_date" | "status"> }[];
};

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select(`${EVENT_COLUMNS}, event_players(count)`)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<EventWithCount[]>();
  const active = (events ?? []).filter((e) => e.status === "active");
  const previous = (events ?? []).filter((e) => e.status === "closed");

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Events</h1>

      <Link
        href="/events/new"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
      >
        + Start New Event
      </Link>

      <div className="mt-4">
        <Suspense>
          <SearchBox placeholder="Search players across all events" label="Search players across all events" />
        </Suspense>
      </div>

      <div className="mt-4">
        {q ? (
          <SearchResults q={q} />
        ) : (
          <SwipeTabs
            label="Events"
            tabs={[
              { id: "active", label: "Active Events", count: active.length },
              { id: "previous", label: "Previous Showcases", count: previous.length },
            ]}
          >
            <EventList
              events={active}
              empty="No active events. Start one when you arrive at a showcase."
            />
            <EventList events={previous} empty="Closed events will show up here." />
          </SwipeTabs>
        )}
      </div>
    </div>
  );
}

function EventList({ events, empty }: { events: EventWithCount[]; empty: string }) {
  if (events.length === 0) {
    return <p className="rounded-3xl bg-surface p-8 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-surface">
      {events.map((event) => {
        const players = event.event_players[0]?.count ?? 0;
        return (
          <li key={event.id}>
            <Link
              href={eventPath(event.id)}
              className="flex items-center gap-3 px-4 py-4 transition-colors active:bg-surface-muted sm:hover:bg-surface-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{event.name}</p>
                <p className="text-sm text-muted">
                  {formatEventDate(event.event_date)} · {players} player{players === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-muted">›</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function SearchResults({ q }: { q: string }) {
  const supabase = await createClient();

  // Every word must match a first or last name ("maya john" finds Maya Johnson).
  let query = supabase
    .from("players")
    .select(
      "id, first_name, last_name, grad_year, position, club_team, event_players(traffic_light, event:events(id, name, event_date, status))",
    )
    .order("last_name")
    .order("first_name")
    .limit(50);
  for (const term of q.replace(/[%,()*\\]/g, " ").split(/\s+/).filter(Boolean)) {
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }
  const { data, error } = await query.returns<SearchResult[]>();

  if (error) return <p className="rounded-3xl bg-red/10 p-6 text-red">Search failed: {error.message}</p>;
  if (!data?.length) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center">
        <p className="font-semibold">No players found</p>
        <p className="mt-1 text-sm text-muted">Searched every event, including closed ones.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 px-1 text-sm text-muted">
        {data.length === 50 ? "First 50 players" : `${data.length} player${data.length === 1 ? "" : "s"}`} across all
        events
      </p>
      <ul className="space-y-2">
        {data.map((p) => {
          const seen = [...p.event_players].sort((a, b) => b.event.event_date.localeCompare(a.event.event_date));
          return (
            <li key={p.id} className="rounded-2xl bg-surface p-4">
              <p className="font-semibold">
                {p.first_name} {p.last_name}
              </p>
              {describePlayer(p) && <p className="text-sm text-muted">{describePlayer(p)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {seen.length === 0 && <span className="text-sm text-muted">Not in any event</span>}
                {seen.map(({ event, traffic_light }) => (
                  <Link
                    key={event.id}
                    href={eventPlayerPath(event.id, p.id)}
                    className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-sm font-medium"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${traffic_light ? TRAFFIC_LIGHT_DOT[traffic_light] : "border border-muted"}`}
                    />
                    <span className="max-w-48 truncate">{event.name}</span>
                    <span className="text-muted">· {formatEventDate(event.event_date)}</span>
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
