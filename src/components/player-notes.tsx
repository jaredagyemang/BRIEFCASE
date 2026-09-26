"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  deleteNote,
  saveTextNote,
  transcribeNote,
  updateNote,
  uploadVoiceNote,
} from "@/app/players/notes-actions";
import { discardNotePhotos, readSingleNote, saveScannedNotes } from "@/app/events/note-scan-actions";
import { PhotoThumb } from "@/components/photo-viewer";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { preparePhoto } from "@/lib/prepare-photo";
import { inputClass } from "@/components/ui";

export type NoteItem = {
  id: string;
  // null = a voice note that hasn't been transcribed yet.
  text: string | null;
  audioUrl: string | null;
  isVoice: boolean;
  // A handwritten note's photo (a short-lived link), or null.
  photoUrl: string | null;
  author: string | null;
  when: string;
  // Whether the signed-in user may edit/delete it (they wrote it, or it has
  // no author).
  canEdit: boolean;
};

const MAX_SECONDS = 5 * 60;

// Recording formats in order of preference; Safari only supports mp4.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const subscribeNoop = () => () => {};
const browserCanRecord = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// A recording that hasn't made it to the server yet (kept so it's never lost).
type PendingRecording = { blob: Blob; url: string; error: string | null };

// A photo of handwritten notes being typed up, then checked before saving.
type Scan = {
  file: File;
  url: string;
  status: "reading" | "draft" | "error";
  photoPath?: string;
  text: string;
  hardToRead: boolean;
  error?: string;
};

export function PlayerNotes({ eventId, playerId, notes }: { eventId: string; playerId: string; notes: NoteItem[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Recording needs MediaRecorder and a secure page (https or localhost).
  // Read during render (after hydration), so when this screen slides in the
  // Record button is already there rather than popping in mid-slide.
  const canRecord = useSyncExternalStore(subscribeNoop, browserCanRecord, () => false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const [transcribeErrors, setTranscribeErrors] = useState<Record<string, string>>({});

  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteItem | null>(null);
  const [savingEdit, startSavingEdit] = useTransition();

  const [scan, setScan] = useState<Scan | null>(null);
  const [savingScan, startSavingScan] = useTransition();
  const scanInputRef = useRef<HTMLInputElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);


  // Warn before leaving while a recording could be lost.
  const unsaved = recording || uploading || pending !== null || scan !== null;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  function saveText() {
    setError(null);
    startSaving(async () => {
      const result = await saveTextNote(eventId, playerId, text);
      if (result.ok) setText("");
      else setError(result.error);
    });
  }

  async function readScan(file: File) {
    setError(null);
    setScan((current) => {
      if (current && current.url !== "" && current.file !== file) URL.revokeObjectURL(current.url);
      return {
        file,
        url: current?.file === file ? current.url : URL.createObjectURL(file),
        status: "reading",
        text: "",
        hardToRead: false,
      };
    });
    const form = new FormData();
    form.append("photo", await preparePhoto(file));
    let result: Awaited<ReturnType<typeof readSingleNote>>;
    try {
      result = await readSingleNote(eventId, playerId, form);
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    setScan((current) =>
      !current || current.file !== file
        ? current
        : result.ok
          ? { ...current, status: "draft", photoPath: result.photoPath, text: result.text, hardToRead: result.hardToRead }
          : { ...current, status: "error", error: result.error },
    );
  }

  function saveScan() {
    if (!scan?.photoPath) return;
    const { photoPath, text: scanned, url } = scan;
    setScan({ ...scan, error: undefined });
    startSavingScan(async () => {
      let result: Awaited<ReturnType<typeof saveScannedNotes>>;
      try {
        result = await saveScannedNotes(eventId, [{ playerId, text: scanned, photoPath }]);
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Your note is still here; try again." };
      }
      if (result.ok) {
        URL.revokeObjectURL(url);
        setScan(null);
      } else {
        setScan((current) => current && { ...current, error: result.rowErrors?.[0] ?? result.error });
      }
    });
  }

  function discardScan() {
    if (!scan) return;
    if (scan.photoPath) void discardNotePhotos(eventId, [scan.photoPath]);
    URL.revokeObjectURL(scan.url);
    setScan(null);
  }

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings to record.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (cancelledRef.current) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      void upload({ blob, url: URL.createObjectURL(blob), error: null });
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
  }

  function stopRecording(cancel = false) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = cancel;
    recorder.stop();
  }

  // Count up while recording and stop automatically at the limit.
  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stopRecording();
    }, 250);
    return () => clearInterval(interval);
  }, [recording]);

  async function upload(recordingToSave: PendingRecording) {
    setPending(recordingToSave);
    setUploading(true);
    const form = new FormData();
    form.append("audio", recordingToSave.blob);

    let result: Awaited<ReturnType<typeof uploadVoiceNote>>;
    try {
      result = await uploadVoiceNote(eventId, playerId, form);
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    setUploading(false);

    if (!result.ok) {
      setPending({ ...recordingToSave, error: result.error });
      return;
    }
    URL.revokeObjectURL(recordingToSave.url);
    setPending(null);
    void transcribe(result.noteId);
  }

  async function transcribe(noteId: string) {
    setTranscribing((s) => new Set(s).add(noteId));
    setTranscribeErrors((errs) => {
      const next = { ...errs };
      delete next[noteId];
      return next;
    });

    let result: Awaited<ReturnType<typeof transcribeNote>>;
    try {
      result = await transcribeNote(noteId);
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Your recording is saved; try again." };
    }

    setTranscribing((s) => {
      const next = new Set(s);
      next.delete(noteId);
      return next;
    });
    if (!result.ok) setTranscribeErrors((errs) => ({ ...errs, [noteId]: result.error }));
  }

  function startEditing(note: NoteItem) {
    setEditError(null);
    setEditing({ id: note.id, draft: note.text ?? "" });
  }

  function saveEdit() {
    if (!editing) return;
    const { id, draft } = editing;
    setEditError(null);
    startSavingEdit(async () => {
      const result = await updateNote(id, draft);
      // Only close the editor if it's still showing this note.
      if (result.ok) setEditing((current) => (current?.id === id ? null : current));
      else setEditError(result.error);
    });
  }

  function removeNote(note: NoteItem) {
    setEditError(null);
    startSavingEdit(async () => {
      const result = await deleteNote(note.id);
      setConfirmDelete(null);
      if (result.ok) setEditing((current) => (current?.id === note.id ? null : current));
      else setEditError(result.error);
    });
  }

  function discardPending() {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  }

  // Voice notes being transcribed that the server list doesn't include yet.
  // (React holds back the refreshed list until transcription finishes, so
  // show them here right away.)
  const inFlight = [...transcribing].filter((id) => !notes.some((n) => n.id === id));

  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-lg font-semibold">Notes</h2>

      <div className="rounded-3xl bg-surface p-3">
        {recording ? (
          <div className="flex items-center gap-3 p-1">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red" />
            <span className="flex-1 font-medium tabular-nums">
              Recording {formatDuration(seconds)}
              <span className="text-muted"> / {formatDuration(MAX_SECONDS)}</span>
            </span>
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => stopRecording()}
              className="rounded-full bg-red px-5 py-2.5 text-sm font-semibold text-white"
            >
              Stop &amp; save
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              maxLength={5000}
              aria-label="Note"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {canRecord && (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={uploading || pending !== null}
                    aria-label="Record voice note"
                    className="flex items-center gap-2 rounded-full bg-surface-muted py-2 pr-4 pl-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-lg leading-none">🎙️</span>
                    Record
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                  disabled={scan !== null}
                  aria-label="Scan handwritten note"
                  className="flex items-center gap-2 rounded-full bg-surface-muted py-2 pr-4 pl-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
                >
                  <span className="text-lg leading-none">✍️</span>
                  Scan
                </button>
                {/* No capture attribute, so phones offer the camera or the photo library. */}
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readScan(file);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={saveText}
                disabled={saving || !text.trim()}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save note"}
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-2 px-1 text-sm text-red">{error}</p>}

      {scan && (
        <div className="mt-3 rounded-2xl bg-surface p-3 ring-2 ring-accent/40" aria-label="Scanned note">
          <div className="flex items-start gap-3">
            <PhotoThumb src={scan.url} alt="Handwritten note" className="h-20 w-16" />
            <div className="min-w-0 flex-1 pt-1">
              {scan.status === "reading" ? (
                <p className="flex items-center gap-2 font-medium">
                  <Spinner /> Reading handwriting…
                </p>
              ) : scan.status === "error" ? (
                <p className="text-sm text-red">{scan.error}</p>
              ) : (
                <p className="text-sm text-muted">Check the text against your handwriting, then save.</p>
              )}
            </div>
          </div>
          {scan.status === "draft" && (
            <>
              <textarea
                value={scan.text}
                onChange={(e) => setScan({ ...scan, text: e.target.value, error: undefined })}
                rows={Math.min(12, Math.max(3, scan.text.split("\n").length + 1))}
                maxLength={5000}
                aria-label="Scanned note text"
                className={`${inputClass} mt-3 resize-y leading-relaxed`}
              />
              {scan.hardToRead && !scan.error && (
                <p className="mt-1 px-1 text-sm text-yellow-700 dark:text-yellow">
                  Some words were hard to read (marked [?]). Check against the photo.
                </p>
              )}
              {scan.error && <p className="mt-1 px-1 text-sm text-red">{scan.error}</p>}
            </>
          )}
          {scan.status !== "reading" && (
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={discardScan}
                disabled={savingScan}
                className="rounded-full bg-surface-muted px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Discard
              </button>
              {scan.status === "error" ? (
                <button
                  type="button"
                  onClick={() => readScan(scan.file)}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                >
                  Try again
                </button>
              ) : (
                <button
                  type="button"
                  onClick={saveScan}
                  disabled={savingScan || !scan.text.trim()}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                >
                  {savingScan ? "Saving…" : "Save scanned note"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-2xl bg-surface p-4">
          {pending.error ? (
            <>
              <p className="text-sm font-medium text-red">{pending.error}</p>
              <p className="mt-1 text-sm text-muted">Your recording is still here and hasn&apos;t been lost.</p>
              <audio src={pending.url} controls className="mt-3 h-10 w-full" />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => upload(pending)}
                  disabled={uploading}
                  className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                >
                  {uploading ? "Retrying…" : "Retry upload"}
                </button>
                <button
                  type="button"
                  onClick={discardPending}
                  disabled={uploading}
                  className="rounded-full bg-surface-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  Discard
                </button>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Saving recording…
            </p>
          )}
        </div>
      )}

      {(notes.length > 0 || inFlight.length > 0) && (
        <ul className="mt-3 space-y-2">
          {inFlight.map((id) => (
            <li key={id} className="rounded-2xl bg-surface px-4 py-3">
              <p className="flex items-center gap-2 text-muted">
                <Spinner /> Transcribing…
              </p>
              <p className="mt-1.5 text-xs text-muted">🎙️ Voice · just now</p>
            </li>
          ))}
          {notes.map((note) =>
            editing?.id === note.id ? (
              <li key={note.id} className="rounded-2xl bg-surface p-3 ring-2 ring-accent/40">
                <textarea
                  value={editing.draft}
                  onChange={(e) => setEditing({ id: note.id, draft: e.target.value })}
                  rows={3}
                  maxLength={5000}
                  autoFocus
                  aria-label="Edit note"
                  className={`${inputClass} resize-y`}
                />
                {note.audioUrl && (
                  <audio src={note.audioUrl} controls preload="none" className="mt-2 h-9 w-full" />
                )}
                {note.photoUrl && (
                  <PhotoThumb src={note.photoUrl} alt="Handwritten note" className="mt-2 block h-16 w-12" />
                )}
                {editError && <p className="mt-2 px-1 text-sm text-red">{editError}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(note)}
                    disabled={savingEdit}
                    className="rounded-full px-3 py-2 text-sm font-semibold text-red disabled:opacity-60"
                  >
                    Delete
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={savingEdit}
                    className="rounded-full bg-surface-muted px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={savingEdit || !editing.draft.trim()}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                  >
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                </div>
              </li>
            ) : (
              <li key={note.id} className="rounded-2xl bg-surface px-4 py-3">
                {note.text !== null ? (
                  <NoteText note={note} onEdit={note.canEdit ? () => startEditing(note) : undefined} />
                ) : transcribing.has(note.id) ? (
                  <p className="flex items-center gap-2 text-muted">
                    <Spinner /> Transcribing…
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {transcribeErrors[note.id] ?? "Not transcribed yet."}
                    </p>
                    {note.canEdit && (
                      <button
                        type="button"
                        onClick={() => transcribe(note.id)}
                        className="shrink-0 rounded-full bg-surface-muted px-3.5 py-1.5 text-sm font-semibold"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
                {note.audioUrl && (
                  <audio src={note.audioUrl} controls preload="none" className="mt-2 h-9 w-full" />
                )}
                {note.photoUrl && (
                  <PhotoThumb src={note.photoUrl} alt="Handwritten note" className="mt-2 block h-16 w-12" />
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {note.isVoice ? "🎙️ Voice · " : note.photoUrl ? "✍️ Handwritten · " : ""}
                    {note.author ?? "Shared login"} · {note.when}
                  </span>
                  {note.canEdit && !transcribing.has(note.id) && (
                    <button
                      type="button"
                      onClick={() => startEditing(note)}
                      className="-my-1 rounded-full px-2 py-1 font-semibold text-accent-ink"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {confirmDelete && (
        <Sheet onClose={() => setConfirmDelete(null)}>
          <SheetTitle
            icon={<span className="mb-2 block text-4xl">🗑️</span>}
            title="Delete this note?"
            subtitle={
              confirmDelete.isVoice
                ? "The note and its recording will be permanently deleted."
                : "This note will be permanently deleted."
            }
          />
          <SheetButton variant="danger" disabled={savingEdit} onClick={() => removeNote(confirmDelete)}>
            {savingEdit ? "Deleting…" : "Delete note"}
          </SheetButton>
          <SheetButton disabled={savingEdit} onClick={() => setConfirmDelete(null)}>
            Cancel
          </SheetButton>
        </Sheet>
      )}
    </section>
  );
}

// A note's text; tapping it starts editing when the user is allowed to.
function NoteText({ note, onEdit }: { note: NoteItem; onEdit?: () => void }) {
  const content = note.text ? (
    <p className="break-words whitespace-pre-wrap">{note.text}</p>
  ) : (
    <p className="text-muted italic">No speech detected</p>
  );
  if (!onEdit) return content;
  return (
    <button type="button" onClick={onEdit} aria-label="Edit note" className="block w-full text-left">
      {content}
    </button>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
