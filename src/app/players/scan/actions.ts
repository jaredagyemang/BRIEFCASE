"use server";

import { revalidatePath } from "next/cache";
import type { DuplicateMatch } from "@/lib/duplicates";
import { isEmail } from "@/lib/form";
import { readGpa } from "@/lib/gpa";
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
  // Why the GPA needs a look (converted from a percentage/range, or couldn't
  // be converted). Cleared once the GPA is edited.
  gpa_note: string | null;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100;

function parseYear(value: string): number | null {
  const year = Number(value.trim());
  return value.trim() && Number.isInteger(year) ? year : null;
}

function keyFields(row: Pick<RosterRow, "first_name" | "last_name" | "grad_year">) {
  return { first_name: row.first_name, last_name: row.last_name, grad_year: parseYear(row.grad_year) };
}

// Step 1: read the photo and return editable rows plus any existing matches.
export async function scanRoster(formData: FormData): Promise<
  | { ok: true; teamName: string; rows: RosterRow[]; matches: DuplicateMatch[][] }
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
    const gpa = readGpa(p.gpa_as_written);
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

  const matches = await findMatchesForMany(supabase, rows.map(keyFields));
  return { ok: true, teamName: roster.team_name ?? "", rows, matches };
}

// Re-checks existing matches after names or grad years are edited.
export async function checkRosterDuplicates(
  rows: Pick<RosterRow, "first_name" | "last_name" | "grad_year">[],
): Promise<DuplicateMatch[][]> {
  const supabase = await createAuthedClient();
  return findMatchesForMany(supabase, rows.slice(0, MAX_ROWS).map(keyFields));
}

type SaveRow = RosterRow & {
  // Existing players this row was confirmed not to be ("Add anyway").
  confirmedNotDuplicateOf: string[];
};

// Step 2: save the rows the person kept. Nothing is saved unless every row is
// valid and every possible duplicate has been confirmed.
export async function saveRosterPlayers(input: { rows: SaveRow[] }): Promise<
  | { ok: true; added: number }
  | { ok: false; error: string; rowErrors?: Record<number, string>; matches?: DuplicateMatch[][] }
> {
  const rows = input.rows.slice(0, MAX_ROWS);
  if (rows.length === 0) return { ok: false, error: "There are no players to add." };

  const rowErrors: Record<number, string> = {};
  const records = rows.map((row, i) => {
    const first_name = row.first_name.trim();
    const last_name = row.last_name.trim();
    const jersey_number = row.jersey_number.trim().replace(/^#/, "") || null;
    const grad_year = parseYear(row.grad_year);
    const gpaText = row.gpa.trim();
    const gpa = gpaText ? Number(gpaText) : null;
    const email = row.email.trim() || null;
    if (!first_name || !last_name) rowErrors[i] = "Add a first and last name";
    else if (row.grad_year.trim() && !(grad_year && grad_year >= 2000 && grad_year <= 2100))
      rowErrors[i] = "Grad year should be a 4-digit year";
    else if (gpa !== null && !(gpa >= 0 && gpa <= 5)) rowErrors[i] = "GPA should be between 0 and 5";
    else if (email && !isEmail(email)) rowErrors[i] = "Enter a valid email";
    else if (jersey_number && jersey_number.length > 10) rowErrors[i] = "Jersey number is too long";
    return {
      first_name,
      last_name,
      jersey_number,
      grad_year,
      gpa,
      email,
      position: row.position.trim().slice(0, 50) || null,
      club_team: row.club_team.trim().slice(0, 100) || null,
    };
  });
  if (Object.keys(rowErrors).length > 0) {
    return { ok: false, error: "Fix the highlighted rows first.", rowErrors };
  }

  const supabase = await createAuthedClient();
  const matches = await findMatchesForMany(supabase, records);
  const unconfirmed = matches.some((m, i) => m.some((match) => !rows[i].confirmedNotDuplicateOf.includes(match.id)));
  if (unconfirmed) {
    return { ok: false, error: "Some players may already exist. Review the highlighted rows.", matches };
  }

  const { error } = await supabase.from("players").insert(records);
  if (error) return { ok: false, error: "Couldn't save the players. Check your connection and try again." };

  revalidatePath("/players");
  return { ok: true, added: records.length };
}
