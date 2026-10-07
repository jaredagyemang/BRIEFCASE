"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";

// "Add roster" on an event: asks whether the roster is a photo or a link,
// then goes into the same roster flow as before (review, duplicate check,
// Club / Grad Year buttons).
export function AddRosterButton({ scanPath }: { scanPath: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-surface-muted py-3 text-center text-sm font-semibold"
      >
        📋 Add roster
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <SheetTitle title="Photo or link?" subtitle="Add players from a roster sheet or a roster web page." />
          <Link href={scanPath} className="block w-full rounded-2xl bg-surface-muted py-3.5 text-center font-semibold">
            📷 Photo of a roster
          </Link>
          <Link
            href={`${scanPath}?source=link`}
            className="block w-full rounded-2xl bg-surface-muted py-3.5 text-center font-semibold"
          >
            🔗 Link to a roster page
          </Link>
          <SheetButton onClick={() => setOpen(false)}>Cancel</SheetButton>
        </Sheet>
      )}
    </>
  );
}
