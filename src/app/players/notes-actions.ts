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

export async function saveTextNote(playerId: string, text: string): Promise<NoteResult> {
  const note = text.trim();
  if (!note) return { ok: false, error: "Write something first." };
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `Keep notes under ${NOTE_MAX.toLocaleString()} characters.` };
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase
    .from("evaluations")
    .insert({ player_id: playerId, transcript_text: note });
  if (error) return { ok: false, error: "Couldn't save the note. Check your connection and try again." };

  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}

// Step 1 of a voice note: store the recording and create the note, so the
// audio is safe before transcription is attempted.
export async function uploadVoiceNote(
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
    .insert({ player_id: playerId, raw_audio_url: path })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "Couldn't save the recording. Try again." };
  }

  revalidatePath(`/players/${playerId}`);
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

  const { error: updateError } = await supabase
    .from("evaluations")
    .update({ transcript_text: text })
    .eq("id", noteId);
  if (updateError) return { ok: false, error: "Transcribed, but couldn't save the text. Try again." };

  revalidatePath(`/players/${note.player_id}`);
  return { ok: true, text };
}
