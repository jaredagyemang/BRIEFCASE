import Link from "next/link";

export default function EventNotFound() {
  return (
    <div className="rounded-3xl bg-surface p-10 text-center">
      <p className="font-semibold">Not found</p>
      <p className="mt-1 text-sm text-muted">This event or player doesn&apos;t exist, or the player wasn&apos;t seen at this event.</p>
      <Link href="/events" className="mt-3 inline-block text-accent">
        Back to events
      </Link>
    </div>
  );
}
