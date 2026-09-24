import { PlayerForm } from "@/components/player-form";
import { updatePlayer } from "../../actions";
import { getPlayer } from "../data";

export default async function EditPlayerPage({ params }: PageProps<"/players/[id]/edit">) {
  const { id } = await params;
  const player = await getPlayer(id);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Edit player</h1>
      <PlayerForm
        action={updatePlayer.bind(null, player.id)}
        player={player}
        submitLabel="Save"
        cancelHref={`/players/${player.id}`}
      />
    </div>
  );
}
