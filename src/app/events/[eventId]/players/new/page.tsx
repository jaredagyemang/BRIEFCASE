import { PlayerForm } from "@/components/player-form";
import { createPlayer } from "@/app/players/actions";
import { eventPath } from "@/lib/events";
import { getEvent } from "@/lib/events-server";

export default async function NewEventPlayerPage({ params }: PageProps<"/events/[eventId]/players/new">) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">New player</h1>
      <p className="mt-1 mb-6 text-muted">Adding to {event.name}</p>
      <PlayerForm
        eventId={eventId}
        action={createPlayer.bind(null, eventId)}
        submitLabel="Add player"
        cancelHref={eventPath(eventId)}
      />
    </div>
  );
}
