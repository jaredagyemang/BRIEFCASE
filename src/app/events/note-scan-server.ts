import "server-only";
import {
  NoteScanError,
  readNotesPagePhoto,
  type PageNote,
  type RosterEntry,
} from "@/lib/note-scan";
import type { createAuthedClient } from "@/lib/supabase/server";

// Shared by the note-scan Server Actions and the page-reading route.

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const BUCKET = "note-photos";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const EXTENSION: Record<(typeof IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type Supabase = Awaited<ReturnType<typeof createAuthedClient>>;

// A photo path this event's scans could have created.
export const photoPathFor = (eventId: string) =>
  new RegExp(`^${eventId}/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$`, "i");

async function readPhoto(formData: FormData) {
  const photo = formData.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) return { error: "No photo was received. Try again." } as const;
  if (photo.size > IMAGE_MAX_BYTES) return { error: "That photo is too large. Try taking it again." } as const;
  const mediaType = IMAGE_TYPES.find((t) => t === photo.type);
  if (!mediaType) return { error: "That file type isn't supported. Use a JPEG or PNG photo." } as const;
  return { photo, mediaType, data: Buffer.from(await photo.arrayBuffer()) } as const;
}

// Stores the photo while Claude reads it (at the same time, to save a few
// seconds); if reading fails, the photo is removed again.
export async function storeAndRead<T>(
  supabase: Supabase,
  eventId: string,
  formData: FormData,
  read: (image: { data: string; mediaType: (typeof IMAGE_TYPES)[number] }) => Promise<T>,
): Promise<Result<{ photoPath: string; value: T }>> {
  const photo = await readPhoto(formData);
  if ("error" in photo) return { ok: false, error: photo.error! };

  const photoPath = `${eventId}/${crypto.randomUUID()}.${EXTENSION[photo.mediaType]}`;
  const [upload, reading] = await Promise.allSettled([
    supabase.storage.from(BUCKET).upload(photoPath, photo.data, { contentType: photo.mediaType }),
    read({ data: photo.data.toString("base64"), mediaType: photo.mediaType }),
  ]);
  const uploaded = upload.status === "fulfilled" && !upload.value.error;

  if (reading.status === "rejected") {
    if (uploaded) await supabase.storage.from(BUCKET).remove([photoPath]);
    const error = reading.reason;
    if (!(error instanceof NoteScanError)) console.error("Reading notes failed", error);
    return { ok: false, error: error instanceof NoteScanError ? error.message : "Reading failed. Try again." };
  }
  if (!uploaded) {
    return { ok: false, error: "Couldn't upload the photo. Check your connection and try again." };
  }
  return { ok: true, photoPath, value: reading.value };
}

// Reads one page of notes (bulk capture at an event) and matches each note
// to a player at the event.
export async function readNotesPage(
  supabase: Supabase,
  eventId: string,
  formData: FormData,
): Promise<Result<{ photoPath: string; notes: PageNote[] }>> {

  const { data: roster, error } = await supabase
    .from("event_players")
    .select("jersey_number, player:players!inner(id, first_name, last_name, position, grad_year, club_team)")
    .eq("event_id", eventId)
    .returns<{ jersey_number: string | null; player: Omit<RosterEntry, "jersey_number"> }[]>();
  if (error) return { ok: false, error: "Couldn't load this event's players. Try again." };

  const entries: RosterEntry[] = (roster ?? [])
    .map((r) => ({ ...r.player, jersey_number: r.jersey_number }))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

  const result = await storeAndRead(supabase, eventId, formData, (image) => readNotesPagePhoto(image, entries));
  if (!result.ok) return result;
  return { ok: true, photoPath: result.photoPath, notes: result.value };
}


// Deletes photos of this event's scans that no note (saved or waiting) uses.
export async function removeUnusedPhotos(supabase: Supabase, eventId: string, photoPaths: string[]) {
  const validPhoto = photoPathFor(eventId);
  const candidates = [...new Set(photoPaths)].filter((p) => typeof p === "string" && validPhoto.test(p)).slice(0, 100);
  if (!candidates.length) return;
  const [{ data: saved }, { data: waiting }] = await Promise.all([
    supabase.from("evaluations").select("note_image_url").in("note_image_url", candidates),
    supabase.from("waiting_notes").select("note_image_url").in("note_image_url", candidates),
  ]);
  const inUse = new Set([...(saved ?? []), ...(waiting ?? [])].map((u) => u.note_image_url));
  const unused = candidates.filter((p) => !inUse.has(p));
  if (!unused.length) return;
  // A leftover photo is only wasted storage, so a failure here isn't shown.
  const { error } = await supabase.storage.from(BUCKET).remove(unused);
  if (error) console.error("Couldn't remove unused note photos", error);
}
