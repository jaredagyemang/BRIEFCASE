"use client";

import { useState, useTransition } from "react";
import { addPlayerForNote, type NotePlayer } from "@/app/events/waiting-notes-actions";
import type { PlayerDuplicate } from "@/app/players/actions";
import { Sheet, SheetButton } from "@/components/sheet";
import { inputClass } from "@/components/ui";

// Adds the player a note is about to the event, filled in from what was
// written on the page ("#99 Jordan"). If someone with that name is already
// in Briefcase, offers them first.
export function NewPlayerSheet({
  eventId,
  writtenName,
  writtenJersey,
  onAdded,
  onClose,
}: {
  eventId: string;
  writtenName: string | null;
  writtenJersey: string | null;
  onAdded: (player: NotePlayer) => void;
  onClose: () => void;
}) {
  const [first, ...rest] = (writtenName ?? "").trim().split(/\s+/);
  const [values, setValues] = useState({
    first_name: first ?? "",
    last_name: rest.join(" "),
    jersey_number: writtenJersey ?? "",
    grad_year: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PlayerDuplicate[] | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(choice: Parameters<typeof addPlayerForNote>[2]) {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addPlayerForNote>>;
      try {
        result = await addPlayerForNote(eventId, values, choice);
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      }
      if (result.ok) {
        onAdded(result.player);
        return;
      }
      if ("duplicates" in result) setDuplicates(result.duplicates);
      else setError(result.error);
    });
  }

  const field = (key: keyof typeof values, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block px-1 text-sm font-medium text-muted">{label}</span>
      <input
        value={values[key]}
        onChange={(e) => {
          setValues({ ...values, [key]: e.target.value });
          setDuplicates(null);
        }}
        className={inputClass}
        {...extra}
      />
    </label>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="pb-1 text-center">
        <p className="text-lg font-semibold">Add as new player</p>
        <p className="text-sm text-muted">Adds them to this event and puts the note on their page.</p>
      </div>

      {duplicates ? (
        <div className="space-y-2">
          <p className="px-1 text-sm font-semibold">⚠️ Already in Briefcase</p>
          {duplicates.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={pending}
              onClick={() => submit({ kind: "existing", playerId: d.id })}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-left disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.name}</span>
                <span className="block truncate text-sm text-muted">
                  {[d.detail, d.inEvent && "already at this event"].filter(Boolean).join(" · ") || "No details yet"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-accent-ink">Use</span>
            </button>
          ))}
          <SheetButton
            disabled={pending}
            onClick={() => submit({ kind: "new", confirmedNotDuplicateOf: duplicates.map((d) => d.id) })}
          >
            {pending ? "Adding…" : "Different person — add new"}
          </SheetButton>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ kind: "new", confirmedNotDuplicateOf: [] });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {field("first_name", "First name", { autoComplete: "off", autoFocus: !values.first_name })}
            {field("last_name", "Last name", { autoComplete: "off", autoFocus: Boolean(values.first_name) })}
            {field("jersey_number", "Jersey # (this event)", { inputMode: "numeric" })}
            {field("grad_year", "Grad year (optional)", { inputMode: "numeric", placeholder: "e.g. 2027" })}
          </div>
          {error && <p className="px-1 text-sm text-red">{error}</p>}
          <SheetButton
            type="submit"
            variant="primary"
            disabled={pending || !values.first_name.trim() || !values.last_name.trim()}
          >
            {pending ? "Adding…" : "Add player"}
          </SheetButton>
        </form>
      )}
      <SheetButton disabled={pending} onClick={onClose}>
        Cancel
      </SheetButton>
      {duplicates && error && <p className="px-1 text-sm text-red">{error}</p>}
    </Sheet>
  );
}
