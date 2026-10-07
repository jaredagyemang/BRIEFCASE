"use client";

import { useTransition } from "react";
import { removeFromListAction } from "@/app/docket/actions";
import type { SnapshotList } from "@/lib/gmail/docket";

const LIST_NAME: Record<SnapshotList, string> = { shortlist: "the Shortlist", shared: "Shared with team" };

export function RemoveFromListButton({ list, id, name }: { list: SnapshotList; id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${name} from ${LIST_NAME[list]}`}
      onClick={() => startTransition(() => removeFromListAction(list, id))}
      className="hit-lg relative shrink-0 rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold text-muted disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
