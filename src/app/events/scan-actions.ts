"use server";

import { revalidatePath } from "next/cache";
import type { DuplicateMatch } from "@/lib/duplicates";
import type { PlayerDuplicate } from "@/app/players/actions";
import { isEmail } from "@/lib/form";
import { normalizeGpa, readRosterGpa } from "@/lib/gpa";
import { findMatchesForMany } from "@/lib/duplicates-server";
import { RosterScanError, scanRosterImage } from "@/lib/roster-scan";
import { createAuthedClient } from "@/lib/supabase/server";

// A roster row as edited on the review screen (all text, straight from inputs).
export type RosterRow = {
  jersey_number: string;
  first_name: string;
  last_name: string;
  position: string;
  grad_year: string;
  gpa: string;
  email: string;
  club_team: string;
  unclear: boolean;
  // Set when the roster's GPA couldn't be read as a 4.0-scale value or a
  // percentage. Cleared once the GPA is edited.
  gpa_note: string | null;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100;

function parseYear(value: string): number | null {
  const year = Number(value.trim());
  return value.trim() && Number.isInteger(year) ? year : null;
}

type Supabase = Awaited<ReturnType<typeof createAuthedClient>>;

// Existing matches for each row, marking players already seen at this event.
async function matchesInEvent(
  supabase: Supabase,
  eventId: string,
  rows: Pick<RosterRow, "first_name" | "last_name" | "grad_year">[],
): Promise<PlayerDuplicate[][]> {
  const matches = await findMatchesForMany(supabase, rows.map(keyFields));
  const ids = [...new Set(matches.flat().map((m) => m.id))];
  const { data } = ids.length
    ? await supabase.from("event_players").select("player_id").eq("event_id", eventId).in("player_id", ids)
    : { data: [] };
  const inEvent = new Set((data ?? []).map((r) => r.player_id));
  return matches.map((list) => list.map((m: DuplicateMatch) => ({ ...m, inEvent: inEvent.has(m.id) })));
}

function keyFields(row: Pick<RosterRow, "first_name" | "last_name" | "grad_year">) {
  return { first_name: row.first_name, last_name: row.last_name, grad_year: parseYear(row.grad_year) };
}

// Step 1: read the photo and return editable rows plus any existing matches.
export async function scanRoster(
  eventId: string,
  formData: FormData,
): Promise<
  | { ok: true; teamName: string; rows: RosterRow[]; matches: PlayerDuplicate[][] }
  | { ok: false; error: string }
> {
  const photo = formData.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) return { ok: false, error: "No photo was received. Try again." };
  if (photo.size > IMAGE_MAX_BYTES) return { ok: false, error: "That photo is too large. Try taking it again." };
  const mediaType = IMAGE_TYPES.find((t) => t === photo.type);
  if (!mediaType) return { ok: false, error: "That file type isn't supported. Use a JPEG or PNG photo." };

  const supabase = await createAuthedClient();

  let roster;
  try {
    roster = await scanRosterImage({
      data: Buffer.from(await photo.arrayBuffer()).toString("base64"),
      mediaType,
    });
  } catch (error) {
    return { ok: false, error: error instanceof RosterScanError ? error.message : "Scanning failed. Try again." };
  }

  const rows: RosterRow[] = roster.players.slice(0, MAX_ROWS).map((p) => {
    const gpa = readRosterGpa(p.gpa_as_written);
    return {
      jersey_number: p.jersey_number ?? "",
      first_name: p.first_name.trim(),
      last_name: p.last_name.trim(),
      position: p.position ?? "",
      grad_year: p.grad_year && p.grad_year >= 2000 && p.grad_year <= 2100 ? String(p.grad_year) : "",
      gpa: gpa.gpa,
      gpa_note: gpa.note,
      email: (p.email ?? "").trim().replace(/\s+/g, "").toLowerCase(),
      club_team: (p.club_team ?? roster.team_name ?? "").trim(),
      unclear: p.unclear,
    };
  });
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Couldn't find any players in that photo. Get the whole roster in frame, in good light, and try again.",
    };
  }

  const matches = await matchesInEvent(supabase, eventId, rows);
  return { ok: true, teamName: roster.team_name ?? "", rows, matches };
}

// Re-checks existing matches after names or grad years are edited.
export async function checkRosterDuplicates(
  eventId: string,
  rows: Pick<RosterRow, "first_name" | "last_name" | "grad_year">[],
): Promise<PlayerDuplicate[][]> {
  const supabase = await createAuthedClient();
  return matchesInEvent(supabase, eventId, rows.slice(0, MAX_ROWS));
}

// What to do with a row: add an existing player to this event, or create a
// new player (confirmed not to be any of the listed matches).
export type RowChoice =
  | { kind: "existing"; playerId: string }
  | { kind: "new"; confirmedNotDuplicateOf: string[] };

type SaveRow = RosterRow & { choice: RowChoice };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Step 2: save the rows the person kept. Existing players are added to this
// event as-is (their saved details aren't changed); new players are created.
// Nothing is saved unless every row is valid and every possible duplicate of a
// new player has been confirmed.
export async function saveRosterPlayers(input: { eventId: string; rows: SaveRow[] }): Promise<
  | { ok: true; added: number }
  | { ok: false; error: string; rowErrors?: Record<number, string>; matches?: PlayerDuplicate[][] }
> {
  const { eventId } = input;
  const rows = input.rows.slice(0, MAX_ROWS);
  if (rows.length === 0) return { ok: false, error: "There are no players to add." };

  const rowErrors: Record<number, string> = {};
  const records = rows.map((row, i) => {
    const first_name = row.first_name.trim();
    const last_name = row.last_name.trim();
    const jersey_number = row.jersey_number.trim().replace(/^#/, "") || null;
    const grad_year = parseYear(row.grad_year);
    const gpaResult = normalizeGpa(row.gpa);
    const gpa = gpaResult.ok ? gpaResult.value : null;
    const email = row.email.trim() || null;
    const existing = row.choice?.kind === "existing";
    if (existing && !UUID.test(row.choice.kind === "existing" ? row.choice.playerId : "")) rowErrors[i] = "Pick a player";
    else if (jersey_number && jersey_number.length > 10) rowErrors[i] = "Jersey number is too long";
    else if (!existing) {
      if (!first_name || !last_name) rowErrors[i] = "Add a first and last name";
      else if (row.grad_year.trim() && !(grad_year && grad_year >= 2000 && grad_year <= 2100))
        rowErrors[i] = "Grad year should be a 4-digit year";
      else if (!gpaResult.ok) rowErrors[i] = gpaResult.error;
      else if (email && !isEmail(email)) rowErrors[i] = "Enter a valid email";
    }
    return {
      jersey_number,
      player: {
        first_name,
        last_name,
        grad_year,
        gpa,
        email,
        position: row.position.trim().slice(0, 50) || null,
        club_team: row.club_team.trim().slice(0, 100) || null,
        status_event_id: eventId,
      },
    };
  });
  if (Object.keys(rowErrors).length > 0) {
    return { ok: false, error: "Fix the highlighted rows first.", rowErrors };
  }

  const supabase = await createAuthedClient();

  // New players must not match anyone who wasn't confirmed as a different person.
  const newIndexes = rows.flatMap((row, i) => (row.choice.kind === "new" ? [i] : []));
  const matches = await matchesInEvent(supabase, eventId, rows);
  const unconfirmed = newIndexes.some((i) => {
    const choice = rows[i].choice as Extract<RowChoice, { kind: "new" }>;
    return matches[i].some((m) => !choice.confirmedNotDuplicateOf.includes(m.id));
  });
  if (unconfirmed) {
    return { ok: false, error: "Some players may already exist. Review the highlighted rows.", matches };
  }

  let created: { id: string }[] = [];
  if (newIndexes.length > 0) {
    const { data, error } = await supabase
      .from("players")
      .insert(newIndexes.map((i) => records[i].player))
      .select("id");
    if (error || !data || data.length !== newIndexes.length) {
      return { ok: false, error: "Couldn't save the players. Check your connection and try again." };
    }
    created = data;
  }

  const appearances = rows.map((row, i) => ({
    event_id: eventId,
    player_id: row.choice.kind === "existing" ? row.choice.playerId : created[newIndexes.indexOf(i)].id,
    jersey_number: records[i].jersey_number,
  }));
  const { data: inserted, error } = await supabase
    .from("event_players")
    .upsert(appearances, { onConflict: "event_id,player_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    // Don't leave new players that aren't in any event.
    if (created.length) await supabase.from("players").delete().in("id", created.map((c) => c.id));
    return { ok: false, error: "Couldn't add the players to this event. Try again." };
  }

  revalidatePath("/events", "layout");
  // Players listed twice on the roster, or already in the event, count once.
  return { ok: true, added: inserted?.length ?? 0 };
}
