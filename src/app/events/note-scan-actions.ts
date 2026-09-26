"use server";

import { revalidatePath } from "next/cache";
import { photoPathFor, storeAndRead, type Supabase } from "@/app/events/note-scan-server";
import { readSingleNotePhoto } from "@/lib/note-scan";
import { createAuthedClient } from "@/lib/supabase/server";

// Handwritten notes: each photo is stored in the private "note-photos"
// bucket while Claude reads it, and saved notes keep a link to it
// (evaluations.note_image_url). Several notes can share one page's photo.
// (Pages of a bulk scan are read by the scan-notes/read route instead, so
// several can be read at once; Server Actions run one at a time.)

export type { MatchStatus, PageNote } from "@/lib/note-scan";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const BUCKET = "note-photos";
const NOTE_MAX = 5000;
const MAX_NOTES = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- One player (from their page)

export async function readSingleNote(
  eventId: string,
  playerId: string,
  formData: FormData,
): Promise<Result<{ photoPath: string; text: string; hardToRead: boolean }>> {
  if (!UUID.test(eventId) || !UUID.test(playerId)) return { ok: false, error: "Couldn't find that player." };
  const supabase = await createAuthedClient();
  const { data: seen } = await supabase
    .from("event_players")
    .select("jersey_number, player:players!inner(first_name, last_name)")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle<{ jersey_number: string | null; player: { first_name: string; last_name: string } }>();
  if (!seen) return { ok: false, error: "Couldn't find that player at this event." };

  const result = await storeAndRead(supabase, eventId, formData, (image) =>
    readSingleNotePhoto(image, {
      name: `${seen.player.first_name} ${seen.player.last_name}`,
      jersey: seen.jersey_number,
    }),
  );
  if (!result.ok) return result;
  return { ok: true, photoPath: result.photoPath, ...result.value };
}

// ---- Saving

export type NoteToSave = { playerId: string; text: string; photoPath: string };

// Saves typed-up notes to their players at this event, each linked to the
// photo it came from. `unusedPhotos` are photos from this scan whose notes
// were all removed; they're deleted. Nothing is saved unless every note is
// valid.
export async function saveScannedNotes(
  eventId: string,
  notes: NoteToSave[],
  unusedPhotos: string[] = [],
): Promise<Result<{ saved: number }> & { rowErrors?: Record<number, string> }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Couldn't find that event." };
  if (notes.length === 0) return { ok: false, error: "There are no notes to save." };
  if (notes.length > MAX_NOTES) return { ok: false, error: `Save at most ${MAX_NOTES} notes at a time.` };

  const supabase = await createAuthedClient();
  const { data: seen, error: loadError } = await supabase
    .from("event_players")
    .select("player_id")
    .eq("event_id", eventId);
  if (loadError) return { ok: false, error: "Couldn't check this event's players. Try again." };
  const atEvent = new Set((seen ?? []).map((r) => r.player_id));
  const validPhoto = photoPathFor(eventId);

  const rowErrors: Record<number, string> = {};
  const rows = notes.map((n, i) => {
    const text = typeof n.text === "string" ? n.text.trim() : "";
    if (!n.playerId || !atEvent.has(n.playerId)) rowErrors[i] = "Pick a player from this event";
    else if (!text) rowErrors[i] = "This note is empty. Remove it instead.";
    else if (text.length > NOTE_MAX) rowErrors[i] = `Keep notes under ${NOTE_MAX.toLocaleString()} characters`;
    else if (!validPhoto.test(n.photoPath)) rowErrors[i] = "This note's photo is missing. Scan the page again.";
    return { event_id: eventId, player_id: n.playerId, transcript_text: text, note_image_url: n.photoPath };
  });
  if (Object.keys(rowErrors).length) return { ok: false, error: "Fix the highlighted notes first.", rowErrors };

  const { error } = await supabase.from("evaluations").insert(rows);
  if (error) return { ok: false, error: "Couldn't save the notes. Check your connection and try again." };

  await removeUnusedPhotos(supabase, eventId, unusedPhotos);
  revalidatePath("/events", "layout");
  return { ok: true, saved: rows.length };
}

// Removes photos from a scan that was abandoned, or whose notes were all
// removed. Photos a saved note still uses are kept.
export async function discardNotePhotos(eventId: string, photoPaths: string[]): Promise<void> {
  if (!UUID.test(eventId)) return;
  const supabase = await createAuthedClient();
  await removeUnusedPhotos(supabase, eventId, photoPaths);
}

async function removeUnusedPhotos(supabase: Supabase, eventId: string, photoPaths: string[]) {
  const validPhoto = photoPathFor(eventId);
  const candidates = [...new Set(photoPaths)].filter((p) => typeof p === "string" && validPhoto.test(p)).slice(0, 100);
  if (!candidates.length) return;
  const { data: used } = await supabase.from("evaluations").select("note_image_url").in("note_image_url", candidates);
  const inUse = new Set((used ?? []).map((u) => u.note_image_url));
  const unused = candidates.filter((p) => !inUse.has(p));
  if (!unused.length) return;
  // A leftover photo is only wasted storage, so a failure here isn't shown.
  const { error } = await supabase.storage.from(BUCKET).remove(unused);
  if (error) console.error("Couldn't remove unused note photos", error);
}
