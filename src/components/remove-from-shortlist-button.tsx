"use client";

import { useTransition } from "react";
import { removeFromShortlistAction } from "@/app/docket/actions";

export function RemoveFromShortlistButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${name} from the Shortlist`}
      onClick={() => startTransition(() => removeFromShortlistAction(id))}
      className="shrink-0 rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold text-muted disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
