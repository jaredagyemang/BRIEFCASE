import { PlayerForm } from "@/components/player-form";
import { createPlayer } from "../actions";

export default function NewPlayerPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">New player</h1>
      <PlayerForm action={createPlayer} submitLabel="Add player" cancelHref="/players" />
    </div>
  );
}
