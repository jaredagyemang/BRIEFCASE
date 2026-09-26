"use server";

import { revalidatePath } from "next/cache";
import { transcribeAudio } from "@/lib/openai";
import { createAuthedClient } from "@/lib/supabase/server";

// Notes are evaluations rows with transcript_text (typed or transcribed) and,
// for voice notes, raw_audio_url pointing at the file in Storage.
// These actions return errors instead of throwing so the message reaches the
// person using the app.

export type NoteResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BUCKET = "voice-notes";
const NOTE_MAX = 5000;
const AUDIO_MAX_BYTES = 11 * 1024 * 1024;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export async function saveTextNote(eventId: string, playerId: string, text: string): Promise<NoteResult> {
  const note = text.trim();
  if (!note) return { ok: false, error: "Write something first." };
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `Keep notes under ${NOTE_MAX.toLocaleString()} characters.` };
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase
    .from("evaluations")
    .insert({ event_id: eventId, player_id: playerId, transcript_text: note });
  if (error) return { ok: false, error: "Couldn't save the note. Check your connection and try again." };

  revalidatePath("/events", "layout");
  return { ok: true };
}

// Step 1 of a voice note: store the recording and create the note, so the
// audio is safe before transcription is attempted.
export async function uploadVoiceNote(
  eventId: string,
  playerId: string,
  formData: FormData,
): Promise<NoteResult<{ noteId: string }>> {
  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return { ok: false, error: "The recording was empty. Try again." };
  }
  if (audio.size > AUDIO_MAX_BYTES) {
    return { ok: false, error: "That recording is too long. Keep voice notes under 5 minutes." };
  }
  const mime = audio.type.split(";")[0].trim();
  const ext = AUDIO_EXTENSIONS[mime];
  if (!ext) return { ok: false, error: "This browser recorded an unsupported audio format." };

  const supabase = await createAuthedClient();
  const path = `${playerId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: mime });
  if (uploadError) return { ok: false, error: "Couldn't upload the recording. Check your connection and try again." };

  const { data, error } = await supabase
    .from("evaluations")
    .insert({ event_id: eventId, player_id: playerId, raw_audio_url: path })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "Couldn't save the recording. Try again." };
  }

  revalidatePath("/events", "layout");
  return { ok: true, noteId: data.id };
}

// Step 2 of a voice note: send the stored recording to Whisper and save the
// text. Safe to retry; the recording is never deleted on failure.
export async function transcribeNote(noteId: string): Promise<NoteResult<{ text: string }>> {
  const supabase = await createAuthedClient();

  const { data: note, error } = await supabase
    .from("evaluations")
    .select("player_id, raw_audio_url")
    .eq("id", noteId)
    .maybeSingle<{ player_id: string; raw_audio_url: string | null }>();
  if (error || !note?.raw_audio_url) return { ok: false, error: "Couldn't find that recording." };

  const { data: audio, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(note.raw_audio_url);
  if (downloadError || !audio) return { ok: false, error: "Couldn't load the recording. Try again." };

  let text: string;
  try {
    text = await transcribeAudio(audio, note.raw_audio_url.split("/").pop()!);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Transcription failed. Try again." };
  }

  const { data: updated, error: updateError } = await supabase
    .from("evaluations")
    .update({ transcript_text: text })
    .eq("id", noteId)
    .select("id");
  if (updateError) return { ok: false, error: "Transcribed, but couldn't save the text. Try again." };
  // Row-Level Security blocks updates to other people's notes silently.
  if (!updated?.length) return { ok: false, error: "Only the person who recorded this note can transcribe it." };

  revalidatePath("/events", "layout");
  return { ok: true, text };
}

type OwnedNote = {
  player_id: string;
  raw_audio_url: string | null;
  note_image_url: string | null;
  traffic_light_rating: string | null;
  rated_by: string | null;
};

// Loads a note the signed-in user may change: their own notes, plus old
// notes from the shared login that have no author.
async function loadEditableNote(noteId: string) {
  const supabase = await createAuthedClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  const { data: note } = await supabase
    .from("evaluations")
    .select("player_id, raw_audio_url, note_image_url, traffic_light_rating, rated_by")
    .eq("id", noteId)
    .maybeSingle<OwnedNote>();

  if (!note || note.traffic_light_rating) {
    return { supabase, note: null, error: "Couldn't find that note." } as const;
  }
  if (note.rated_by && note.rated_by !== userId) {
    return { supabase, note: null, error: "Only the person who wrote this note can change it." } as const;
  }
  return { supabase, note, error: null } as const;
}

// Corrects a note's text. A voice note keeps its original recording.
export async function updateNote(noteId: string, text: string): Promise<NoteResult> {
  const updated = text.trim();
  if (!updated) return { ok: false, error: "A note can't be empty. Delete it instead." };
  if (updated.length > NOTE_MAX) {
    return { ok: false, error: `Keep notes under ${NOTE_MAX.toLocaleString()} characters.` };
  }

  const { supabase, note, error } = await loadEditableNote(noteId);
  if (!note) return { ok: false, error };

  const { data: changed, error: updateError } = await supabase
    .from("evaluations")
    .update({ transcript_text: updated })
    .eq("id", noteId)
    .select("id");
  if (updateError) return { ok: false, error: "Couldn't save your changes. Try again." };
  if (!changed?.length) return { ok: false, error: "Only the person who wrote this note can change it." };

  revalidatePath("/events", "layout");
  return { ok: true };
}

// Removes a note and, for voice notes, its recording. A handwritten note's
// photo is removed too, unless another note from the same page still uses it.
export async function deleteNote(noteId: string): Promise<NoteResult> {
  const { supabase, note, error } = await loadEditableNote(noteId);
  if (!note) return { ok: false, error };

  const { data: deleted, error: deleteError } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", noteId)
    .select("id");
  if (deleteError) return { ok: false, error: "Couldn't delete the note. Try again." };
  if (!deleted?.length) return { ok: false, error: "Only the person who wrote this note can change it." };

  // The note is gone either way; a leftover file is only wasted storage.
  if (note.raw_audio_url) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([note.raw_audio_url]);
    if (removeError) console.error("Couldn't remove voice note file", note.raw_audio_url, removeError);
  }
  if (note.note_image_url) {
    const { count } = await supabase
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .eq("note_image_url", note.note_image_url);
    if (count === 0) {
      const { error: removeError } = await supabase.storage.from("note-photos").remove([note.note_image_url]);
      if (removeError) console.error("Couldn't remove note photo", note.note_image_url, removeError);
    }
  }

  revalidatePath("/events", "layout");
  return { ok: true };
}
