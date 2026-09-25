import { PlayerForm } from "@/components/player-form";
import { updatePlayer } from "@/app/players/actions";
import { eventPlayerPath } from "@/lib/events";
import { getEventPlayer } from "@/lib/events-server";

export default async function EditEventPlayerPage({ params }: PageProps<"/events/[eventId]/players/[playerId]/edit">) {
  const { eventId, playerId } = await params;
  const { player, appearance } = await getEventPlayer(eventId, playerId);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Edit player</h1>
      <PlayerForm
        eventId={eventId}
        action={updatePlayer.bind(null, eventId, playerId)}
        player={player}
        jerseyNumber={appearance.jersey_number}
        submitLabel="Save"
        cancelHref={eventPlayerPath(eventId, playerId)}
      />
    </div>
  );
}
