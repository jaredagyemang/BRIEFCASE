import Link from "next/link";

export default function PlayerNotFound() {
  return (
    <div className="rounded-3xl bg-surface p-10 text-center">
      <p className="font-semibold">Player not found</p>
      <Link href="/players" className="mt-3 inline-block text-accent">
        Back to players
      </Link>
    </div>
  );
}
