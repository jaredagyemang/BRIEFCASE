"use client";

import { useRouter } from "next/navigation";

// ‹ Back to wherever the coach came from, or to The Docket when opened
// directly (e.g. from a link).
export function BackButton({ label = "‹ Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/docket"))}
      className="text-accent-ink"
    >
      {label}
    </button>
  );
}
