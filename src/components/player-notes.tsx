"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveTextNote, transcribeNote, uploadVoiceNote } from "@/app/players/notes-actions";

export type NoteItem = {
  id: string;
  // null = a voice note that hasn't been transcribed yet.
  text: string | null;
  audioUrl: string | null;
  isVoice: boolean;
  author: string | null;
  when: string;
};

const MAX_SECONDS = 5 * 60;

// Recording formats in order of preference; Safari only supports mp4.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// A recording that hasn't made it to the server yet (kept so it's never lost).
type PendingRecording = { blob: Blob; url: string; error: string | null };

export function PlayerNotes({ playerId, notes }: { playerId: string; notes: NoteItem[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const [canRecord, setCanRecord] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const [transcribeErrors, setTranscribeErrors] = useState<Record<string, string>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Recording needs MediaRecorder and a secure page (https or localhost).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only check after hydration
    setCanRecord(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  // Warn before leaving while a recording could be lost.
  const unsaved = recording || uploading || pending !== null;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  function saveText() {
    setError(null);
    startSaving(async () => {
      const result = await saveTextNote(playerId, text);
      if (result.ok) setText("");
      else setError(result.error);
    });
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
      result = await uploadVoiceNote(playerId, form);
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
              {canRecord ? (
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
              ) : (
                <span />
              )}
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
          {notes.map((note) => (
            <li key={note.id} className="rounded-2xl bg-surface px-4 py-3">
              {note.text !== null ? (
                note.text ? (
                  <p className="break-words whitespace-pre-wrap">{note.text}</p>
                ) : (
                  <p className="text-muted italic">No speech detected</p>
                )
              ) : transcribing.has(note.id) ? (
                <p className="flex items-center gap-2 text-muted">
                  <Spinner /> Transcribing…
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted">
                    {transcribeErrors[note.id] ?? "Not transcribed yet."}
                  </p>
                  <button
                    type="button"
                    onClick={() => transcribe(note.id)}
                    className="shrink-0 rounded-full bg-surface-muted px-3.5 py-1.5 text-sm font-semibold"
                  >
                    Retry
                  </button>
                </div>
              )}
              {note.audioUrl && (
                <audio src={note.audioUrl} controls preload="none" className="mt-2 h-9 w-full" />
              )}
              <p className="mt-1.5 text-xs text-muted">
                {note.isVoice ? "🎙️ Voice · " : ""}
                {note.author ?? "Shared login"} · {note.when}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
