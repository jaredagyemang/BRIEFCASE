import Link from "next/link";

export default function CoachNotFound() {
  return (
    <div className="rounded-3xl bg-surface p-10 text-center">
      <p className="font-semibold">Coach not found</p>
      <Link href="/coaches" className="mt-3 inline-block text-accent">
        Back to coaches
      </Link>
    </div>
  );
}
