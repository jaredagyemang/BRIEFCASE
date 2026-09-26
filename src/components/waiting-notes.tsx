"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { assignWaitingNote, discardWaitingNote, type NotePlayer } from "@/app/events/waiting-notes-actions";
import { NewPlayerSheet } from "@/components/new-player-sheet";
import { PhotoThumb } from "@/components/photo-viewer";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { inputClass } from "@/components/ui";
import { eventPath } from "@/lib/events";

// Notes kept with an event until their player is added. The coach who wrote
// one picks the player (or adds them here) and assigns it, which moves it to
// that player's notes, or discards it.

export type WaitingNote = {
  id: string;
  text: string;
  photoUrl: string | null;
  writtenAs: string | null;
  writtenName: string | null;
  writtenJersey: string | null;
  author: string | null;
  when: string;
  canEdit: boolean;
};

export function WaitingNotes({
  eventId,
  eventName,
  notes,
  players: initialPlayers,
}: {
  eventId: string;
  eventName: string;
  notes: WaitingNote[];
  players: NotePlayer[];
}) {
  const [players, setPlayers] = useState(initialPlayers);
  // Notes handled on this screen (assigned or discarded), hidden right away.
  const [done, setDone] = useState<Record<string, string>>({});
  const remaining = notes.filter((n) => !done[n.id]);

  function addPlayer(player: NotePlayer) {
    setPlayers((current) =>
      current.some((p) => p.id === player.id)
        ? current
        : [...current, player].sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name))),
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Link href={eventPath(eventId)} className="truncate text-accent-ink">
          ‹ {eventName}
        </Link>
        <h1 className="text-lg font-semibold">Waiting notes</h1>
        <span />
      </div>
      <p className="mt-4 px-1 text-sm text-muted">
        Handwritten notes about players who weren&apos;t in this event yet. Assign each one once the player is added.
      </p>

      {Object.keys(done).length > 0 && (
        <p role="status" className="mt-4 rounded-2xl bg-green/15 px-4 py-3 text-sm font-medium">
          {Object.values(done).at(-1)}
        </p>
      )}

      {remaining.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-surface p-8 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 font-semibold">No notes waiting</p>
          <Link href={eventPath(eventId)} className="mt-4 inline-block font-semibold text-accent-ink">
            Back to {eventName}
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {remaining.map((note) => (
            <WaitingNoteCard
              key={note.id}
              eventId={eventId}
              note={note}
              players={players}
              onPlayerAdded={addPlayer}
              onDone={(message) => setDone((d) => ({ ...d, [note.id]: message }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WaitingNoteCard({
  eventId,
  note,
  players,
  onPlayerAdded,
  onDone,
}: {
  eventId: string;
  note: WaitingNote;
  players: NotePlayer[];
  onPlayerAdded: (player: NotePlayer) => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState(note.text);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = note.writtenAs ? `Note about “${note.writtenAs}”` : "Note";

  function assign() {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof assignWaitingNote>>;
      try {
        result = await assignWaitingNote(note.id, player.id, text);
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      }
      if (result.ok) onDone(`Note added to ${player.name}’s page.`);
      else setError(result.error);
    });
  }

  function discard() {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof discardWaitingNote>>;
      try {
        result = await discardWaitingNote(note.id);
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      }
      setConfirmDiscard(false);
      if (result.ok) onDone("Note discarded.");
      else setError(result.error);
    });
  }

  return (
    <li aria-label={label} className="rounded-2xl bg-surface p-3">
      <div className="flex items-start gap-3">
        {note.photoUrl && <PhotoThumb src={note.photoUrl} alt="Handwritten note" className="h-16 w-12" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {note.writtenAs ? `Written as “${note.writtenAs}”` : "No name or number on the page"}
          </p>
          <p className="text-xs text-muted">
            ✍️ {note.author ?? "Shared login"} · {note.when}
          </p>
        </div>
      </div>

      {note.canEdit ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`${label} text`}
            rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
            maxLength={5000}
            className={`${inputClass} mt-3 resize-y leading-relaxed`}
          />
          <div className="mt-2 flex items-center gap-2">
            <select
              value={playerId}
              onChange={(e) => {
                setPlayerId(e.target.value);
                setError(null);
              }}
              aria-label={`${label} player`}
              className={`${inputClass} min-w-0 flex-1 ${playerId ? "font-semibold" : "text-muted"}`}
            >
              <option value="">Pick a player…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.jersey ? `#${p.jersey} ` : ""}
                  {p.name}
                  {players.filter((o) => o.name === p.name).length > 1 &&
                    ` (${[p.grad_year, p.club].filter(Boolean).join(", ")})`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={assign}
              disabled={pending || !playerId || !text.trim()}
              className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              {pending ? "Saving…" : "Assign"}
            </button>
          </div>
          {error && <p className="mt-2 px-1 text-sm text-red">{error}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full bg-surface-muted px-3.5 py-1.5 text-sm font-semibold"
            >
              + Add as new player
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              disabled={pending}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-red disabled:opacity-60"
            >
              Discard
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 break-words whitespace-pre-wrap">{note.text}</p>
          <p className="mt-2 text-sm text-muted">Only {note.author ?? "its writer"} can assign or discard this note.</p>
        </>
      )}

      {adding && (
        <NewPlayerSheet
          eventId={eventId}
          writtenName={note.writtenName}
          writtenJersey={note.writtenJersey}
          onClose={() => setAdding(false)}
          onAdded={(player) => {
            onPlayerAdded(player);
            setPlayerId(player.id);
            setAdding(false);
          }}
        />
      )}
      {confirmDiscard && (
        <Sheet onClose={() => setConfirmDiscard(false)}>
          <SheetTitle
            icon={<span className="mb-2 block text-4xl">🗑️</span>}
            title="Discard this note?"
            subtitle="It will be permanently deleted, along with its photo unless other notes use it."
          />
          <SheetButton variant="danger" disabled={pending} onClick={discard}>
            {pending ? "Discarding…" : "Discard note"}
          </SheetButton>
          <SheetButton disabled={pending} onClick={() => setConfirmDiscard(false)}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
    </li>
  );
}

// "Maya Johnson" → "Johnson Maya", to keep the list in last-name order.
function lastFirst(name: string) {
  const parts = name.split(" ");
  return `${parts.slice(1).join(" ")} ${parts[0]}`;
}
