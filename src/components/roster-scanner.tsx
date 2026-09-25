"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  checkRosterDuplicates,
  saveRosterPlayers,
  scanRoster,
  type RosterRow,
} from "@/app/events/scan-actions";
import type { PlayerDuplicate } from "@/app/players/actions";
import { duplicateKey } from "@/lib/duplicates";
import { eventPath } from "@/lib/events";

// Claude reads images up to 2576px on the long edge; shrinking phone photos
// to that keeps uploads fast on event Wi-Fi without losing detail.
const MAX_EDGE = 2576;

async function preparePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // Couldn't decode here; let the server decide.
  }
}

type Item = {
  id: number;
  row: RosterRow;
  // Existing players with the same name and grad year.
  matches: PlayerDuplicate[];
  choice: Choice;
  error?: string;
};

type Stage = "capture" | "scanning" | "review";

// What happens to a row on save.
type Choice =
  | { kind: "existing"; playerId: string } // add this existing player to the event
  | { kind: "new" } // create a new player
  | { kind: "skip" }; // already in this event

// A match you've seen again is most likely the same person, so default to
// adding them to this event; skip players who are already in it.
function defaultChoice(matches: PlayerDuplicate[]): Choice {
  const available = matches.find((m) => !m.inEvent);
  if (available) return { kind: "existing", playerId: available.id };
  return matches.length > 0 ? { kind: "skip" } : { kind: "new" };
}

const cellClass =
  "min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 placeholder:text-muted";

let nextId = 1;
const emptyRow = (club_team: string): RosterRow => ({
  jersey_number: "",
  first_name: "",
  last_name: "",
  position: "",
  grad_year: "",
  gpa: "",
  email: "",
  club_team,
  unclear: false,
  gpa_note: null,
});

export function RosterScanner({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [clubForAll, setClubForAll] = useState("");
  const [yearForAll, setYearForAll] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, startSaving] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Warn before leaving with an unsaved review.
  const unsaved = stage === "review" && items.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("scanning");
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));

    const form = new FormData();
    form.append("photo", await preparePhoto(file));
    let result: Awaited<ReturnType<typeof scanRoster>>;
    try {
      result = await scanRoster(eventId, form);
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    if (!result.ok) {
      setError(result.error);
      setStage("capture");
      return;
    }
    setClubForAll(result.teamName);
    setItems(
      result.rows.map((row, i) => {
        const matches = result.matches[i] ?? [];
        return { id: nextId++, row, matches, choice: defaultChoice(matches) };
      }),
    );
    setStage("review");
  }

  // Re-check existing matches shortly after names or grad years change.
  function scheduleDuplicateCheck(next: Item[]) {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      try {
        const matches = await checkRosterDuplicates(eventId, next.map((it) => it.row));
        setItems((current) =>
          current.map((it) => {
            const i = next.findIndex((n) => n.id === it.id);
            if (i === -1) return it;
            const updated = matches[i] ?? [];
            const same = updated.map((m) => m.id).join() === it.matches.map((m) => m.id).join();
            return same ? it : { ...it, matches: updated, choice: defaultChoice(updated) };
          }),
        );
      } catch {
        // Keep the last known matches; saving re-checks on the server anyway.
      }
    }, 500);
  }

  function updateRow(id: number, field: keyof RosterRow, value: string) {
    const next = items.map((it) =>
      it.id === id
        ? {
            ...it,
            // Editing the GPA means it's been checked; drop the review note.
            row: { ...it.row, [field]: value, ...(field === "gpa" && { gpa_note: null }) },
            error: undefined,
          }
        : it,
    );
    setItems(next);
    if (field === "first_name" || field === "last_name" || field === "grad_year") scheduleDuplicateCheck(next);
  }

  function applyYearToAll() {
    if (!yearForAll.trim()) return;
    const next = items.map((it) => ({ ...it, row: { ...it.row, grad_year: yearForAll.trim() }, error: undefined }));
    setItems(next);
    scheduleDuplicateCheck(next);
  }

  function applyClubToAll() {
    if (!clubForAll.trim()) return;
    setItems((current) => current.map((it) => ({ ...it, row: { ...it.row, club_team: clubForAll.trim() } })));
  }

  function setChoice(id: number, choice: Choice) {
    setItems((current) => current.map((c) => (c.id === id ? { ...c, choice, error: undefined } : c)));
  }

  function removeRow(id: number) {
    setItems((current) => current.filter((it) => it.id !== id));
  }

  function addRow() {
    setItems((current) => [
      ...current,
      { id: nextId++, row: emptyRow(clubForAll.trim()), matches: [], choice: { kind: "new" } },
    ]);
  }

  // Rows that will be saved: everything except possible duplicates the
  // person hasn't chosen to add anyway.
  const toSave = items.filter((it) => it.choice.kind !== "skip");
  const existingCount = toSave.filter((it) => it.choice.kind === "existing").length;

  // Earlier row on this roster with the same name and grad year, if any.
  const sameAsEarlier = (index: number) => {
    const key = duplicateKey({ ...items[index].row, grad_year: Number(items[index].row.grad_year) || null });
    const earlier = items
      .slice(0, index)
      .findIndex((it) => duplicateKey({ ...it.row, grad_year: Number(it.row.grad_year) || null }) === key);
    return items[index].row.last_name.trim() && earlier !== -1 ? earlier + 1 : null;
  };

  function save() {
    setError(null);
    startSaving(async () => {
      let result: Awaited<ReturnType<typeof saveRosterPlayers>>;
      try {
        result = await saveRosterPlayers({
          eventId,
          rows: toSave.map((it) => ({
            ...it.row,
            choice:
              it.choice.kind === "existing"
                ? it.choice
                : { kind: "new" as const, confirmedNotDuplicateOf: it.matches.map((m) => m.id) },
          })),
        });
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Your review is still here; try again." };
      }
      if (result.ok) {
        setItems([]);
        router.push(`${eventPath(eventId)}?added=${result.added}`);
        return;
      }
      setError(result.error);
      const { rowErrors, matches } = result;
      setItems((current) =>
        current.map((it) => {
          const i = toSave.findIndex((s) => s.id === it.id);
          if (i === -1) return it;
          return {
            ...it,
            error: rowErrors?.[i],
            ...(matches && matches[i]?.length ? { matches: matches[i], choice: defaultChoice(matches[i]) } : {}),
          };
        }),
      );
    });
  }

  if (stage !== "review") {
    return (
      <div>
        <Header eventId={eventId} eventName={eventName} />
        <div className="mt-6 rounded-3xl bg-surface p-6 text-center">
          {stage === "scanning" ? (
            <>
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
                <img src={photoUrl} alt="Roster photo" className="mx-auto max-h-64 rounded-2xl object-contain" />
              )}
              <p className="mt-5 flex items-center justify-center gap-2 font-semibold">
                <Spinner /> Reading roster…
              </p>
              <p className="mt-1 text-sm text-muted">This usually takes a few seconds.</p>
            </>
          ) : (
            <>
              <p className="text-5xl">📋</p>
              <p className="mt-3 font-semibold">Photograph a paper roster</p>
              <p className="mt-1 text-sm text-muted">
                Fit the whole list in frame, hold steady, and use good light. You&apos;ll review every player before
                anything is saved.
              </p>
              {error && <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="mt-5 w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
              >
                📷 Take photo
              </button>
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                className="mt-2 w-full rounded-2xl bg-surface-muted py-3.5 font-semibold"
              >
                Choose from photos
              </button>
            </>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void onPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  const skipped = items.length - toSave.length;

  return (
    <div className="pb-44 sm:pb-24">
      <Header eventId={eventId} eventName={eventName} />

      <div className="mt-4 rounded-3xl bg-surface p-4">
        <div className="flex items-center gap-3">
          {photoUrl && (
            <button type="button" onClick={() => setShowPhoto((s) => !s)} aria-label="Show roster photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken */}
              <img src={photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {items.length} player{items.length === 1 ? "" : "s"} found
            </p>
            <p className="text-sm text-muted">Check each row, fix anything misread, and remove extras.</p>
          </div>
        </div>
        {showPhoto && photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
          <img src={photoUrl} alt="Roster photo" className="mt-3 w-full rounded-2xl" />
        )}
        <div className="mt-4 space-y-3">
          <ApplyToAll
            label="Club team for everyone"
            value={clubForAll}
            onChange={setClubForAll}
            onApply={applyClubToAll}
            placeholder="e.g. Solar SC"
          />
          <ApplyToAll
            label="Grad year for everyone"
            value={yearForAll}
            onChange={setYearForAll}
            onApply={applyYearToAll}
            placeholder="e.g. 2027"
            inputMode="numeric"
          />
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((it, index) => {
          const skippedRow = it.choice.kind === "skip";
          const earlier = sameAsEarlier(index);
          return (
            <li
              key={it.id}
              className={`rounded-2xl bg-surface p-3 ${it.error ? "ring-2 ring-red" : it.row.unclear || it.row.gpa_note ? "ring-2 ring-yellow/60" : ""} ${skippedRow ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-2">
                <input
                  value={it.row.jersey_number}
                  onChange={(e) => updateRow(it.id, "jersey_number", e.target.value)}
                  aria-label={`Row ${index + 1} jersey number`}
                  placeholder="#"
                  inputMode="numeric"
                  className={`${cellClass} w-14 shrink-0 text-center`}
                />
                <input
                  value={it.row.first_name}
                  onChange={(e) => updateRow(it.id, "first_name", e.target.value)}
                  aria-label={`Row ${index + 1} first name`}
                  placeholder="First"
                  className={`${cellClass} flex-1`}
                />
                <input
                  value={it.row.last_name}
                  onChange={(e) => updateRow(it.id, "last_name", e.target.value)}
                  aria-label={`Row ${index + 1} last name`}
                  placeholder="Last"
                  className={`${cellClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(it.id)}
                  aria-label={`Remove row ${index + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted active:bg-surface-muted"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 pr-11">
                <input
                  value={it.row.position}
                  onChange={(e) => updateRow(it.id, "position", e.target.value)}
                  aria-label={`Row ${index + 1} position`}
                  placeholder="Position"
                  className={`${cellClass} flex-1`}
                />
                <input
                  value={it.row.grad_year}
                  onChange={(e) => updateRow(it.id, "grad_year", e.target.value)}
                  aria-label={`Row ${index + 1} grad year`}
                  placeholder="Grad yr"
                  inputMode="numeric"
                  className={`${cellClass} w-24 shrink-0`}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 pr-11">
                <input
                  value={it.row.club_team}
                  onChange={(e) => updateRow(it.id, "club_team", e.target.value)}
                  aria-label={`Row ${index + 1} club team`}
                  placeholder="Club team"
                  className={`${cellClass} flex-1`}
                />
                <input
                  value={it.row.gpa}
                  onChange={(e) => updateRow(it.id, "gpa", e.target.value)}
                  aria-label={`Row ${index + 1} GPA`}
                  placeholder="GPA or %"
                  className={`${cellClass} w-28 shrink-0 ${it.row.gpa_note ? "border-yellow" : ""}`}
                />
              </div>
              <div className="mt-2 pr-11">
                <input
                  value={it.row.email}
                  onChange={(e) => updateRow(it.id, "email", e.target.value)}
                  aria-label={`Row ${index + 1} email`}
                  placeholder="Email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  className={`${cellClass} w-full`}
                />
              </div>

              {it.error && <p className="mt-2 px-1 text-sm text-red">{it.error}</p>}
              {it.row.gpa_note && !it.error && (
                <p className="mt-2 px-1 text-sm text-yellow-700 dark:text-yellow">{it.row.gpa_note}</p>
              )}
              {it.row.unclear && !it.error && (
                <p className="mt-2 px-1 text-sm text-yellow-700 dark:text-yellow">Hard to read. Check this row.</p>
              )}
              {earlier && (
                <p className="mt-2 px-1 text-sm text-yellow-700 dark:text-yellow">
                  Same name and grad year as row {earlier} on this roster.
                </p>
              )}
              {it.matches.length > 0 && (
                <fieldset className="mt-2 rounded-xl bg-yellow/10 p-3">
                  <legend className="sr-only">Row {index + 1}: already in Briefcase</legend>
                  <p className="text-sm font-semibold">⚠️ Already in Briefcase</p>
                  <div className="mt-1 space-y-1.5">
                    {it.matches.map((m) => (
                      <label key={m.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`row-${it.id}`}
                          checked={
                            m.inEvent
                              ? it.choice.kind === "skip"
                              : it.choice.kind === "existing" && it.choice.playerId === m.id
                          }
                          onChange={() => setChoice(it.id, m.inEvent ? { kind: "skip" } : { kind: "existing", playerId: m.id })}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">
                            {m.inEvent ? "Same person (already in this event)" : "Same person — add to this event"}
                          </span>
                          <span className="block truncate text-muted">
                            {m.name}
                            {m.detail && ` · ${m.detail}`}
                          </span>
                        </span>
                        <Link href={`/players/${m.id}`} target="_blank" className="shrink-0 font-semibold text-accent-ink">
                          View
                        </Link>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`row-${it.id}`}
                        checked={it.choice.kind === "new"}
                        onChange={() => setChoice(it.id, { kind: "new" })}
                        className="h-5 w-5 shrink-0 accent-accent"
                      />
                      <span className="font-medium">Different person — add as new</span>
                    </label>
                  </div>
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 w-full rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted"
      >
        + Add a missed player
      </button>

      <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {error && <p className="mb-2 text-sm text-red">{error}</p>}
          {!error && (existingCount > 0 || skipped > 0) && (
            <p className="mb-2 text-center text-sm text-muted">
              {[
                existingCount > 0 && `${existingCount} already in Briefcase`,
                toSave.length - existingCount > 0 && `${toSave.length - existingCount} new`,
                skipped > 0 && `${skipped} already in this event`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || toSave.length === 0}
            className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving
              ? "Adding…"
              : `Add ${toSave.length} player${toSave.length === 1 ? "" : "s"} to event`}
          </button>
        </div>
      </div>
    </div>
  );
}

// A value to set on every row, applied with a button so rows edited one by
// one aren't overwritten by accident.
function ApplyToAll({
  label,
  value,
  onChange,
  onApply,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="flex items-end gap-2">
      <label className="block flex-1">
        <span className="mb-1 block px-1 text-sm font-medium text-muted">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          className={`${cellClass} w-full`}
        />
      </label>
      <button
        type="button"
        onClick={onApply}
        disabled={!value.trim()}
        aria-label={`Apply ${label.toLowerCase()}`}
        className="rounded-xl bg-surface-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}

function Header({ eventId, eventName }: { eventId: string; eventName: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <Link href={eventPath(eventId)} className="truncate text-accent-ink">
        ‹ {eventName}
      </Link>
      <h1 className="text-lg font-semibold">Scan roster</h1>
      <span />
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
