"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  checkRosterDuplicates,
  saveRosterPlayers,
  scanRoster,
  type RosterRow,
} from "@/app/players/scan/actions";
import { duplicateKey, type DuplicateMatch } from "@/lib/duplicates";

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
  matches: DuplicateMatch[];
  // For rows matching an existing player: save anyway (off = skip this row).
  addAnyway: boolean;
  error?: string;
};

type Stage = "capture" | "scanning" | "review";

const cellClass =
  "min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 placeholder:text-muted";

let nextId = 1;
const emptyRow = (): RosterRow => ({
  jersey_number: "",
  first_name: "",
  last_name: "",
  position: "",
  grad_year: "",
  unclear: false,
});

export function RosterScanner() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [clubTeam, setClubTeam] = useState("");
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
      result = await scanRoster(form);
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    if (!result.ok) {
      setError(result.error);
      setStage("capture");
      return;
    }
    setClubTeam(result.teamName);
    setItems(
      result.rows.map((row, i) => ({ id: nextId++, row, matches: result.matches[i] ?? [], addAnyway: false })),
    );
    setStage("review");
  }

  // Re-check existing matches shortly after names or grad years change.
  function scheduleDuplicateCheck(next: Item[]) {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      try {
        const matches = await checkRosterDuplicates(next.map((it) => it.row));
        setItems((current) =>
          current.map((it) => {
            const i = next.findIndex((n) => n.id === it.id);
            if (i === -1) return it;
            const updated = matches[i] ?? [];
            const same = updated.map((m) => m.id).join() === it.matches.map((m) => m.id).join();
            return same ? it : { ...it, matches: updated, addAnyway: false };
          }),
        );
      } catch {
        // Keep the last known matches; saving re-checks on the server anyway.
      }
    }, 500);
  }

  function updateRow(id: number, field: keyof RosterRow, value: string) {
    const next = items.map((it) =>
      it.id === id ? { ...it, row: { ...it.row, [field]: value }, error: undefined } : it,
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

  function removeRow(id: number) {
    setItems((current) => current.filter((it) => it.id !== id));
  }

  function addRow() {
    setItems((current) => [...current, { id: nextId++, row: emptyRow(), matches: [], addAnyway: false }]);
  }

  // Rows that will be saved: everything except possible duplicates the
  // person hasn't chosen to add anyway.
  const toSave = items.filter((it) => it.matches.length === 0 || it.addAnyway);

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
          clubTeam,
          rows: toSave.map((it) => ({
            ...it.row,
            confirmedNotDuplicateOf: it.addAnyway ? it.matches.map((m) => m.id) : [],
          })),
        });
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Your review is still here; try again." };
      }
      if (result.ok) {
        setItems([]);
        router.push(`/players?added=${result.added}`);
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
            ...(matches && matches[i]?.length ? { matches: matches[i], addAnyway: false } : {}),
          };
        }),
      );
    });
  }

  if (stage !== "review") {
    return (
      <div>
        <Header />
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
      <Header />

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
        <label className="mt-4 block">
          <span className="mb-1 block px-1 text-sm font-medium text-muted">Club team (for everyone)</span>
          <input value={clubTeam} onChange={(e) => setClubTeam(e.target.value)} className={`${cellClass} w-full`} />
        </label>
        <div className="mt-3 flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block px-1 text-sm font-medium text-muted">Grad year for everyone</span>
            <input
              value={yearForAll}
              onChange={(e) => setYearForAll(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 2027"
              className={`${cellClass} w-full`}
            />
          </label>
          <button
            type="button"
            onClick={applyYearToAll}
            disabled={!yearForAll.trim()}
            className="rounded-xl bg-surface-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((it, index) => {
          const skippedRow = it.matches.length > 0 && !it.addAnyway;
          const earlier = sameAsEarlier(index);
          return (
            <li
              key={it.id}
              className={`rounded-2xl bg-surface p-3 ${it.error ? "ring-2 ring-red" : it.row.unclear ? "ring-2 ring-yellow/60" : ""} ${skippedRow ? "opacity-70" : ""}`}
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

              {it.error && <p className="mt-2 px-1 text-sm text-red">{it.error}</p>}
              {it.row.unclear && !it.error && (
                <p className="mt-2 px-1 text-sm text-yellow-700 dark:text-yellow">Hard to read. Check this row.</p>
              )}
              {earlier && (
                <p className="mt-2 px-1 text-sm text-yellow-700 dark:text-yellow">
                  Same name and grad year as row {earlier} on this roster.
                </p>
              )}
              {it.matches.length > 0 && (
                <div className="mt-2 rounded-xl bg-yellow/10 p-3">
                  <p className="text-sm font-semibold">⚠️ Already in Briefcase</p>
                  {it.matches.map((m) => (
                    <div key={m.id} className="mt-1 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {m.name}
                        {m.detail && <span className="text-muted"> · {m.detail}</span>}
                      </span>
                      <Link
                        href={`/players/${m.id}`}
                        target="_blank"
                        className="shrink-0 font-semibold text-accent"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={it.addAnyway}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((c) => (c.id === it.id ? { ...c, addAnyway: e.target.checked } : c)),
                        )
                      }
                      className="h-5 w-5 accent-accent"
                    />
                    Not the same person — add anyway
                  </label>
                </div>
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

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl sm:bottom-0">
        <div className="mx-auto max-w-3xl">
          {error && <p className="mb-2 text-sm text-red">{error}</p>}
          {skipped > 0 && !error && (
            <p className="mb-2 text-center text-sm text-muted">
              Skipping {skipped} already in Briefcase
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
              : `Add ${toSave.length} player${toSave.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/players" className="text-accent">
        ‹ Players
      </Link>
      <h1 className="text-lg font-semibold">Scan roster</h1>
      <span className="w-16" />
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
