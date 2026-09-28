"use client";

import { useState } from "react";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";

// "Export" on a player's page: an Excel file of this player at this event,
// optionally with the other events they were seen at (off by default, so
// nothing more is shared than meant).
export function ExportPlayerButton({
  href,
  playerName,
  otherEvents,
}: {
  href: string;
  playerName: string;
  otherEvents: number;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);

  function download() {
    const params = new URLSearchParams();
    if (history) params.set("history", "1");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) params.set("tz", tz);
    const a = document.createElement("a");
    a.href = `${href}?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setHistory(false);
          setOpen(true);
        }}
        className="shrink-0 rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
      >
        ⬇︎ Export
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <SheetTitle
            icon={<span className="mb-2 block text-4xl">📄</span>}
            title={`Export ${playerName}`}
            subtitle="An Excel file with their details, and their rating and notes from this event."
          />
          {otherEvents > 0 && (
            <label className="flex items-start gap-3 rounded-2xl bg-surface-muted px-4 py-3">
              <input
                type="checkbox"
                checked={history}
                onChange={(e) => setHistory(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              />
              <span>
                <span className="block font-medium">
                  Include {otherEvents} other event{otherEvents === 1 ? "" : "s"}
                </span>
                <span className="block text-sm text-muted">
                  Their rating and notes from everywhere else they were seen.
                </span>
              </span>
            </label>
          )}
          <p className="px-1 text-sm text-muted">
            Only text goes in the file: handwriting photos and voice recordings stay in Briefcase.
          </p>
          <SheetButton variant="primary" onClick={download}>
            Download Excel
          </SheetButton>
          <SheetButton onClick={() => setOpen(false)}>Cancel</SheetButton>
        </Sheet>
      )}
    </>
  );
}
