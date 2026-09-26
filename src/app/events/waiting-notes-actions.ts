"use server";

import { revalidatePath } from "next/cache";
import { removeUnusedPhotos } from "@/app/events/note-scan-server";
import type { PlayerDuplicate } from "@/app/players/actions";
import { describePlayer } from "@/lib/duplicates";
import type { Player } from "@/lib/players";
import { createAuthedClient } from "@/lib/supabase/server";

// Notes about players who aren't in the event yet: adding such a player on
// the spot from a scanned note, and assigning or discarding notes that were
// kept on the event's "waiting for a player" list.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 5000;

// A player as the note screens list them (same shape as the scanner's).
export type NotePlayer = {
  id: string;
  name: string;
  jersey: string | null;
  position: string | null;
  grad_year: number | null;
  club: string | null;
  email: string | null;
  gpa: string | null;
};

const PLAYER_COLUMNS = "id, first_name, last_name, position, grad_year, club_team, email, gpa";
type PlayerRow = Pick<Player, "id" | "first_name" | "last_name" | "position" | "grad_year" | "club_team" | "email" | "gpa">;

const toNotePlayer = (p: PlayerRow, jersey: string | null): NotePlayer => ({
  id: p.id,
  name: `${p.first_name} ${p.last_name}`,
  jersey,
  position: p.position,
  grad_year: p.grad_year,
  club: p.club_team,
  email: p.email,
  gpa: p.gpa,
});

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// ---- Add as new player (from a note)

export type NewPlayerInput = { first_name: string; last_name: string; jersey_number: string; grad_year: string };

// Adds the player a note is about to this event. If someone with that name
// is already in Briefcase, their details come back instead, so the coach can
// pick them (choice "existing") or confirm it's someone else ("new", listing
// the matches they've seen).
export async function addPlayerForNote(
  eventId: string,
  input: NewPlayerInput,
  choice: { kind: "new"; confirmedNotDuplicateOf: string[] } | { kind: "existing"; playerId: string },
): Promise<Result<{ player: NotePlayer }> | { ok: false; error: string; duplicates: PlayerDuplicate[] }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Couldn't find that event." };
  const first_name = String(input.first_name ?? "").trim().replace(/\s+/g, " ");
  const last_name = String(input.last_name ?? "").trim().replace(/\s+/g, " ");
  const jersey_number = String(input.jersey_number ?? "").trim().replace(/^#/, "") || null;
  const yearText = String(input.grad_year ?? "").trim();
  const grad_year = yearText ? Number(yearText) : null;

  if (jersey_number && jersey_number.length > 10) return { ok: false, error: "Keep the jersey number under 10 characters." };
  const supabase = await createAuthedClient();

  // Use a player who's already in Briefcase.
  if (choice.kind === "existing") {
    if (!UUID.test(choice.playerId)) return { ok: false, error: "Pick a player." };
    const { data: player } = await supabase.from("players").select(PLAYER_COLUMNS).eq("id", choice.playerId).maybeSingle<PlayerRow>();
    if (!player) return { ok: false, error: "Couldn't find that player." };
    const { error } = await supabase
      .from("event_players")
      .upsert({ event_id: eventId, player_id: player.id, jersey_number }, { onConflict: "event_id,player_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: "Couldn't add the player to this event. Try again." };
    const { data: seen } = await supabase
      .from("event_players")
      .select("jersey_number")
      .eq("event_id", eventId)
      .eq("player_id", player.id)
      .maybeSingle<{ jersey_number: string | null }>();
    revalidatePath("/events", "layout");
    return { ok: true, player: toNotePlayer(player, seen?.jersey_number ?? jersey_number) };
  }

  if (!first_name || !last_name) return { ok: false, error: "Add a first and last name." };
  if (first_name.length > 100 || last_name.length > 100) return { ok: false, error: "That name is too long." };
  if (grad_year !== null && !(Number.isInteger(grad_year) && grad_year >= 2000 && grad_year <= 2100)) {
    return { ok: false, error: "Grad year should be a 4-digit year." };
  }

  // Same name (and grad year, when both have one): probably the same person.
  const { data: sameName, error: matchError } = await supabase
    .from("players")
    .select("id, first_name, last_name, grad_year, position, club_team")
    .ilike("first_name", first_name.replace(/[%_\\]/g, "\\$&"))
    .ilike("last_name", last_name.replace(/[%_\\]/g, "\\$&"))
    .returns<Pick<Player, "id" | "first_name" | "last_name" | "grad_year" | "position" | "club_team">[]>();
  if (matchError) return { ok: false, error: "Couldn't check for existing players. Try again." };
  const matches = (sameName ?? []).filter(
    (p) =>
      norm(p.first_name) === norm(first_name) &&
      norm(p.last_name) === norm(last_name) &&
      (grad_year === null || p.grad_year === null || p.grad_year === grad_year),
  );
  if (matches.some((m) => !choice.confirmedNotDuplicateOf.includes(m.id))) {
    const { data: inEvent } = await supabase
      .from("event_players")
      .select("player_id")
      .eq("event_id", eventId)
      .in("player_id", matches.map((m) => m.id));
    const here = new Set((inEvent ?? []).map((r) => r.player_id));
    return {
      ok: false,
      error: "",
      // Players already at this event first: the most likely match.
      duplicates: matches
        .map((m) => ({
          id: m.id,
          name: `${m.first_name} ${m.last_name}`,
          detail: describePlayer(m),
          inEvent: here.has(m.id),
        }))
        .sort((a, b) => Number(b.inEvent) - Number(a.inEvent)),
    };
  }

  const { data: created, error } = await supabase
    .from("players")
    .insert({ first_name, last_name, grad_year, status_event_id: eventId })
    .select(PLAYER_COLUMNS)
    .single<PlayerRow>();
  if (error || !created) return { ok: false, error: "Couldn't add the player. Check your connection and try again." };

  const { error: linkError } = await supabase
    .from("event_players")
    .insert({ event_id: eventId, player_id: created.id, jersey_number });
  if (linkError) {
    // Don't leave a player that isn't in any event.
    await supabase.from("players").delete().eq("id", created.id);
    return { ok: false, error: "Couldn't add the player to this event. Try again." };
  }

  revalidatePath("/events", "layout");
  return { ok: true, player: toNotePlayer(created, jersey_number) };
}

// ---- Waiting notes

// Moves a waiting note to a player at the event (with the coach's edits to
// its text), keeping its photo and original time.
export async function assignWaitingNote(noteId: string, playerId: string, text: string): Promise<Result> {
  if (!UUID.test(noteId)) return { ok: false, error: "Couldn't find that note." };
  if (!UUID.test(playerId)) return { ok: false, error: "Pick a player first." };
  const finalText = String(text ?? "").trim();
  if (!finalText) return { ok: false, error: "A note can't be empty. Discard it instead." };
  if (finalText.length > NOTE_MAX) return { ok: false, error: `Keep notes under ${NOTE_MAX.toLocaleString()} characters.` };

  const supabase = await createAuthedClient();
  const { error } = await supabase.rpc("assign_waiting_note", {
    target_note_id: noteId,
    target_player_id: playerId,
    final_text: finalText,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Only the person who wrote this note can assign it." };
    if (error.code === "23503") return { ok: false, error: "That player isn't at this event anymore." };
    if (error.code === "P0002") return { ok: false, error: "This note was already assigned or discarded." };
    return { ok: false, error: "Couldn't assign the note. Try again." };
  }
  revalidatePath("/events", "layout");
  return { ok: true };
}

// Deletes a waiting note, and its photo once nothing else uses it.
export async function discardWaitingNote(noteId: string): Promise<Result> {
  if (!UUID.test(noteId)) return { ok: false, error: "Couldn't find that note." };
  const supabase = await createAuthedClient();
  const { data: deleted, error } = await supabase
    .from("waiting_notes")
    .delete()
    .eq("id", noteId)
    .select("event_id, note_image_url");
  if (error) return { ok: false, error: "Couldn't discard the note. Try again." };
  if (!deleted?.length) return { ok: false, error: "Only the person who wrote this note can discard it." };

  const { event_id, note_image_url } = deleted[0];
  if (note_image_url) await removeUnusedPhotos(supabase, event_id, [note_image_url]);
  revalidatePath("/events", "layout");
  return { ok: true };
}
