"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  discardNotePhotos,
  saveScannedNotes,
  type MatchStatus,
  type PageNote,
} from "@/app/events/note-scan-actions";
import { PhotoThumb } from "@/components/photo-viewer";
import { eventPath } from "@/lib/events";
import { exportFileName, scanBatchXlsx, XLSX_TYPE, type ExportPlayer } from "@/lib/note-export";
import { downloadFile, preparePhoto } from "@/lib/prepare-photo";

// Bulk capture of handwritten notes at an event: photograph several pages,
// Claude types up each page and matches every note to a player, then the
// coach checks the matches and text before the notes are saved.

export type ScanPlayer = ExportPlayer & { id: string };

type Page = {
  id: number;
  file: File;
  url: string;
  status: "queued" | "reading" | "done" | "error";
  error?: string;
  photoPath?: string;
};

type Note = {
  id: number;
  pageId: number;
  text: string;
  playerId: string | null;
  // Claude's match, to tell whether the coach changed it.
  aiPlayerId: string | null;
  status: MatchStatus;
  writtenAs: string | null;
  hardToRead: boolean;
  error?: string;
};

type Stage = "capture" | "review" | "saved";

// Pages read at the same time. More would mostly wait on each other.
const PARALLEL = 4;

let nextId = 1;

const cellClass =
  "min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 placeholder:text-muted";

export function NotesScanner({
  eventId,
  eventName,
  players,
}: {
  eventId: string;
  eventName: string;
  players: ScanPlayer[];
}) {
  const [stage, setStage] = useState<Stage>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ notes: number; players: number } | null>(null);
  const [saving, startSaving] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Page[]>([]);
  const running = useRef(0);
  // Pages still on screen, to drop results for pages removed while reading.
  const live = useRef(new Set<number>());

  const byId = new Map(players.map((p) => [p.id, p]));
  const pageNumber = (pageId: number) => pages.findIndex((p) => p.id === pageId) + 1;

  // Warn before leaving with notes that aren't saved.
  const unsaved = stage !== "saved" && pages.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  function addFiles(files: FileList | null, readNow: boolean) {
    if (!files?.length) return;
    setError(null);
    const added: Page[] = [...files]
      .filter((f) => f.type.startsWith("image/") || !f.type)
      .map((file) => ({ id: nextId++, file, url: URL.createObjectURL(file), status: "queued" }));
    added.forEach((p) => live.current.add(p.id));
    setPages((current) => [...current, ...added]);
    if (readNow) read(added);
  }

  function removePage(page: Page) {
    URL.revokeObjectURL(page.url);
    live.current.delete(page.id);
    queue.current = queue.current.filter((p) => p.id !== page.id);
    setPages((current) => current.filter((p) => p.id !== page.id));
    setNotes((current) => current.filter((n) => n.pageId !== page.id));
    if (page.photoPath) void discardNotePhotos(eventId, [page.photoPath]);
  }

  // Reads pages a few at a time; notes appear as each page finishes, so the
  // coach can start checking while the rest are read.
  function read(list: Page[]) {
    queue.current.push(...list);
    setPages((current) => current.map((p) => (list.some((l) => l.id === p.id) ? { ...p, status: "queued", error: undefined } : p)));
    while (running.current < PARALLEL && queue.current.length) {
      running.current++;
      void worker();
    }
  }

  async function worker() {
    try {
      for (let page = queue.current.shift(); page; page = queue.current.shift()) {
        const pageId = page.id;
        setPages((current) => current.map((p) => (p.id === pageId ? { ...p, status: "reading" } : p)));
        const form = new FormData();
        form.append("photo", await preparePhoto(page.file));
        let result: { ok: true; photoPath: string; notes: PageNote[] } | { ok: false; error: string };
        try {
          const response = await fetch(`${eventPath(eventId)}/scan-notes/read`, { method: "POST", body: form });
          result = await response.json();
        } catch {
          result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
        }
        // Removed while it was being read: throw the result away.
        if (!live.current.has(pageId)) {
          if (result.ok) void discardNotePhotos(eventId, [result.photoPath]);
          continue;
        }
        const outcome = result;
        setPages((current) =>
          current.map((p) =>
            p.id !== pageId
              ? p
              : outcome.ok
                ? { ...p, status: "done", photoPath: outcome.photoPath }
                : { ...p, status: "error", error: outcome.error },
          ),
        );
        if (!outcome.ok) continue;
        const found = outcome.notes.map((n) => ({ id: nextId++, pageId, ...n, aiPlayerId: n.playerId }));
        setNotes((current) => [...current, ...found]);
      }
    } finally {
      running.current--;
    }
  }

  function start() {
    setStage("review");
    read(pages.filter((p) => p.status === "queued"));
  }

  function updateNote(id: number, change: Partial<Note>) {
    setNotes((current) => current.map((n) => (n.id === id ? { ...n, ...change, error: undefined } : n)));
    setError(null);
  }

  function removeNote(id: number) {
    setNotes((current) => current.filter((n) => n.id !== id));
  }

  const busy = pages.some((p) => p.status === "queued" || p.status === "reading");
  const unassigned = notes.filter((n) => !n.playerId).length;
  const toCheck = notes.filter((n) => n.playerId && n.status === "check" && n.playerId === n.aiPlayerId).length;
  const matched = notes.length - unassigned - toCheck;
  const done = pages.filter((p) => p.status === "done" || p.status === "error").length;

  function matchLabel(n: Note) {
    if (!n.playerId) return "Unassigned";
    if (n.playerId !== n.aiPlayerId) return "Assigned by coach";
    if (n.status === "matched") return "Matched by AI";
    return stage === "saved" ? "Matched by AI, confirmed by coach" : "Matched by AI (check)";
  }

  function exportExcel() {
    const ordered = [...notes].sort((a, b) => pageNumber(a.pageId) - pageNumber(b.pageId) || a.id - b.id);
    const bytes = scanBatchXlsx(
      eventName,
      ordered.map((n) => ({
        player: n.playerId ? (byId.get(n.playerId) ?? null) : null,
        text: n.text.trim(),
        page: pageNumber(n.pageId),
        matched: matchLabel(n),
      })),
    );
    downloadFile(bytes, exportFileName(eventName, "scanned notes"), XLSX_TYPE);
  }

  function save() {
    setError(null);
    const list = [...notes];
    const photoOf = new Map(pages.map((p) => [p.id, p.photoPath ?? ""]));
    const unusedPhotos = pages.flatMap((p) =>
      p.photoPath && !list.some((n) => n.pageId === p.id) ? [p.photoPath] : [],
    );
    startSaving(async () => {
      let result: Awaited<ReturnType<typeof saveScannedNotes>>;
      try {
        result = await saveScannedNotes(
          eventId,
          list.map((n) => ({ playerId: n.playerId ?? "", text: n.text, photoPath: photoOf.get(n.pageId) ?? "" })),
          unusedPhotos,
        );
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Your notes are still here; try again." };
      }
      if (result.ok) {
        setSaved({ notes: result.saved, players: new Set(list.map((n) => n.playerId)).size });
        setStage("saved");
        return;
      }
      setError(result.error);
      const rowErrors = "rowErrors" in result ? result.rowErrors : undefined;
      if (rowErrors) {
        setNotes((current) => current.map((n) => ({ ...n, error: rowErrors[list.findIndex((l) => l.id === n.id)] })));
      }
    });
  }

  function discardAll() {
    const paths = pages.flatMap((p) => (p.photoPath ? [p.photoPath] : []));
    queue.current = [];
    if (paths.length) void discardNotePhotos(eventId, paths);
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    live.current.clear();
    setPages([]);
    setNotes([]);
    setError(null);
    setStage("capture");
  }

  const fileInputs = (readNow: boolean) => (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, readNow);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, readNow);
          e.target.value = "";
        }}
      />
    </>
  );

  if (stage === "saved" && saved) {
    return (
      <div>
        <Header eventId={eventId} eventName={eventName} />
        <div className="mt-6 rounded-3xl bg-surface p-6 text-center">
          <p className="text-5xl">✅</p>
          <p className="mt-3 text-lg font-semibold">
            Saved {saved.notes} note{saved.notes === 1 ? "" : "s"} for {saved.players} player
            {saved.players === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Each note is on its player&apos;s page at this event, with the photo of your handwriting.
          </p>
          <button
            type="button"
            onClick={exportExcel}
            className="mt-5 w-full rounded-2xl bg-surface-muted py-3.5 font-semibold"
          >
            ⬇︎ Export to Excel
          </button>
          <Link
            href={eventPath(eventId)}
            className="mt-2 block w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
          >
            Back to {eventName}
          </Link>
          <button
            type="button"
            onClick={() => {
              pages.forEach((p) => URL.revokeObjectURL(p.url));
              live.current.clear();
              setPages([]);
              setNotes([]);
              setSaved(null);
              setStage("capture");
            }}
            className="mt-4 text-sm font-semibold text-accent-ink"
          >
            Scan more notes
          </button>
        </div>
      </div>
    );
  }

  if (stage === "capture") {
    return (
      <div className={pages.length ? "pb-44 sm:pb-24" : ""}>
        <Header eventId={eventId} eventName={eventName} />
        <div className="mt-6 rounded-3xl bg-surface p-6 text-center">
          <p className="text-5xl">✍️</p>
          <p className="mt-3 font-semibold">Photograph your handwritten notes</p>
          <p className="mt-1 text-sm text-muted">
            Add every page, one photo per page. Briefcase types them up and matches each note to a player at this
            event. You&apos;ll check everything before it&apos;s saved.
          </p>
          {players.length === 0 && (
            <p className="mt-4 rounded-2xl bg-yellow/10 px-4 py-3 text-left text-sm">
              No players have been added to this event yet, so notes can&apos;t be matched. Scan the roster first.
            </p>
          )}
          {error && <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="mt-5 w-full rounded-2xl bg-surface-muted py-3.5 font-semibold"
          >
            📷 {pages.length ? "Take another page" : "Take photo"}
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="mt-2 w-full rounded-2xl bg-surface-muted py-3.5 font-semibold"
          >
            Choose from photos
          </button>
          {fileInputs(false)}
        </div>

        {pages.length > 0 && (
          <>
            <ul className="mt-4 grid grid-cols-3 gap-2" aria-label="Pages">
              {pages.map((page, i) => (
                <li key={page.id} className="relative">
                  <PhotoThumb src={page.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full" />
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePage(page)}
                    aria-label={`Remove page ${i + 1}`}
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <BottomBar>
              <button
                type="button"
                onClick={start}
                className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
              >
                Read {pages.length} page{pages.length === 1 ? "" : "s"}
              </button>
            </BottomBar>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pb-48 sm:pb-28">
      <Header eventId={eventId} eventName={eventName} />

      <div className="mt-4 rounded-3xl bg-surface p-4" aria-live="polite">
        {busy ? (
          <p className="flex items-center gap-2 font-semibold">
            <Spinner /> Reading page {Math.min(done + 1, pages.length)} of {pages.length}…
          </p>
        ) : (
          <p className="font-semibold">
            {notes.length} note{notes.length === 1 ? "" : "s"} from {pages.length} page{pages.length === 1 ? "" : "s"}
          </p>
        )}
        <p className="mt-0.5 text-sm text-muted">
          {[
            matched > 0 && `${matched} matched`,
            toCheck > 0 && `${toCheck} to check`,
            unassigned > 0 && `${unassigned} unassigned`,
          ]
            .filter(Boolean)
            .join(" · ") || (busy ? "Notes appear here as each page is read." : "No notes found.")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="rounded-xl bg-surface-muted py-2.5 text-sm font-semibold"
          >
            + Add pages
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={notes.length === 0}
            className="rounded-xl bg-surface-muted py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            ⬇︎ Export to Excel
          </button>
        </div>
        {fileInputs(true)}
      </div>

      {pages.map((page, pageIndex) => {
        const pageNotes = notes.filter((n) => n.pageId === page.id);
        return (
          <section key={page.id} className="mt-5" aria-label={`Page ${pageIndex + 1}`}>
            <div className="flex items-center gap-3 px-1">
              <PhotoThumb src={page.url} alt={`Page ${pageIndex + 1}`} className="h-12 w-10" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Page {pageIndex + 1}</h2>
                <p className="text-sm text-muted">
                  {page.status === "done"
                    ? pageNotes.length === 0
                      ? "No notes found on this page"
                      : `${pageNotes.length} note${pageNotes.length === 1 ? "" : "s"}`
                    : page.status === "error"
                      ? "Couldn’t read this page"
                      : page.status === "reading"
                        ? "Reading…"
                        : "Waiting…"}
                </p>
              </div>
              {(page.status === "error" || (page.status === "done" && pageNotes.length === 0)) && (
                <button
                  type="button"
                  onClick={() => removePage(page)}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted"
                >
                  Remove
                </button>
              )}
            </div>

            {page.status === "error" && (
              <div className="mt-2 rounded-2xl bg-red/10 p-3 text-sm">
                <p className="text-red">{page.error}</p>
                <button
                  type="button"
                  onClick={() => read([page])}
                  className="mt-2 rounded-full bg-surface px-4 py-1.5 font-semibold"
                >
                  Try again
                </button>
              </div>
            )}
            {(page.status === "reading" || page.status === "queued") && (
              <div className="mt-2 h-24 animate-pulse rounded-2xl bg-surface" />
            )}

            <ul className="mt-2 space-y-3">
              {pageNotes.map((n, i) => {
                const label = `Page ${pageIndex + 1} note ${i + 1}`;
                const changed = n.playerId !== n.aiPlayerId;
                const flag = !n.playerId ? "unassigned" : !changed && n.status === "check" ? "check" : "ok";
                return (
                  <li
                    key={n.id}
                    aria-label={label}
                    className={`rounded-2xl bg-surface p-3 ${
                      n.error ? "ring-2 ring-red" : flag === "unassigned" ? "ring-2 ring-red/50" : flag === "check" ? "ring-2 ring-yellow/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={n.playerId ?? ""}
                        onChange={(e) => updateNote(n.id, { playerId: e.target.value || null })}
                        aria-label={`${label} player`}
                        className={`${cellClass} flex-1 ${n.playerId ? "font-semibold" : "text-muted"}`}
                      >
                        <option value="">Unassigned — pick a player</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {playerLabel(p, players)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeNote(n.id)}
                        aria-label={`Remove ${label.toLowerCase()}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted active:bg-surface-muted"
                      >
                        ✕
                      </button>
                    </div>
                    <p
                      className={`mt-1.5 px-1 text-sm ${
                        flag === "ok" ? "text-muted" : flag === "check" ? "text-yellow-700 dark:text-yellow" : "text-red"
                      }`}
                    >
                      {flag === "unassigned"
                        ? "Not matched. Pick a player, or remove this note."
                        : flag === "check"
                          ? "Check this match."
                          : changed
                            ? "Assigned by you."
                            : "✓ Matched."}
                      {n.writtenAs && <span className="text-muted"> Written as “{n.writtenAs}”.</span>}
                    </p>
                    <textarea
                      value={n.text}
                      onChange={(e) => updateNote(n.id, { text: e.target.value })}
                      aria-label={`${label} text`}
                      rows={Math.min(10, Math.max(3, n.text.split("\n").length + 1))}
                      maxLength={5000}
                      className={`${cellClass} mt-2 w-full resize-y leading-relaxed`}
                    />
                    {n.hardToRead && !n.error && (
                      <p className="mt-1 px-1 text-sm text-yellow-700 dark:text-yellow">
                        Some words were hard to read (marked [?]). Check against the photo.
                      </p>
                    )}
                    {n.error && <p className="mt-1 px-1 text-sm text-red">{n.error}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <button
        type="button"
        onClick={discardAll}
        className="mt-6 w-full rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted"
      >
        Discard this scan
      </button>

      <BottomBar>
        {error && <p className="mb-2 text-sm text-red">{error}</p>}
        {!error && unassigned > 0 && !busy && (
          <p className="mb-2 text-center text-sm text-muted">
            Assign or remove {unassigned} unassigned note{unassigned === 1 ? "" : "s"} to save.
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || busy || notes.length === 0 || unassigned > 0}
          className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : busy
              ? "Reading pages…"
              : `Save ${notes.length} note${notes.length === 1 ? "" : "s"}`}
        </button>
      </BottomBar>
    </div>
  );
}

// "#7 Maya Johnson", with more detail when two players share a name.
function playerLabel(p: ScanPlayer, all: ScanPlayer[]) {
  const same = all.filter((o) => o.name.toLowerCase() === p.name.toLowerCase()).length > 1;
  const extra = same ? [p.grad_year, p.club].filter(Boolean).join(", ") : "";
  return `${p.jersey ? `#${p.jersey} ` : ""}${p.name}${extra ? ` (${extra})` : ""}`;
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

function Header({ eventId, eventName }: { eventId: string; eventName: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <Link href={eventPath(eventId)} className="truncate text-accent-ink">
        ‹ {eventName}
      </Link>
      <h1 className="text-lg font-semibold">Scan notes</h1>
      <span />
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
