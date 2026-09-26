import "server-only";
import { z } from "zod";
import { ClaudeReadError, readWithClaude } from "@/lib/claude-read";

// Reads photos of handwritten scouting notes with Claude's vision and types
// them up: either a page about one player, or pages covering many players at
// an event, split into one note per player and matched to the event's
// players.

export { ClaudeReadError as NoteScanError };

// How the typed text should look, for both kinds of scan.
const TEXT_RULES = `How to type up a note:
- Use the coach's own words. Keep their abbreviations and shorthand (e.g. "LB", "GK", "1v1", "+", "!!"), ratings and grades exactly as written. Fix obvious spelling slips only.
- Organize it into short lines, one observation per line, each starting with "- ". Keep any headings or labels the coach wrote (e.g. "Strengths:") on their own line.
- Write any word you can't read as [?]. Never guess a name or number you can't read.
- Leave out crossed-out text.
- Never add opinions, details, summaries or conclusions that aren't written on the page.`;

// ---- One player

const SingleNoteSchema = z.object({
  has_notes: z.boolean(),
  text: z.string(),
  hard_to_read: z.boolean(),
});

export async function readSingleNotePhoto(
  image: Image,
  player: { name: string; jersey: string | null },
): Promise<{ text: string; hardToRead: boolean }> {
  const who = `${player.name}${player.jersey ? ` (#${player.jersey})` : ""}`;
  const result = await readWithClaude(
    SingleNoteSchema,
    [
      imageBlock(image),
      {
        type: "text",
        text: `This is a photo of handwritten notes a coach wrote about one player, ${who}, while scouting.

Type up everything on the page as a single note in "text".
${TEXT_RULES}

Set has_notes to false (and text to "") if there's no handwriting in the photo. Set hard_to_read to true if you had to mark words with [?] or aren't sure of parts of the text.`,
      },
    ],
    MESSAGES,
  );
  const text = result.text.trim();
  if (!result.has_notes || !text) {
    throw new ClaudeReadError("Couldn't find any handwriting in that photo. Try again with the page filling the frame.");
  }
  return { text, hardToRead: result.hard_to_read };
}

// ---- A page covering many players

const PageSchema = z.object({
  notes: z.array(
    z.object({
      // The id of the player the note is about ("P3"), from the list given.
      player: z.string().nullable(),
      match: z.enum(["sure", "unsure", "none"]),
      // Exactly as the coach wrote them, to show next to the match.
      written_name: z.string().nullable(),
      written_jersey: z.string().nullable(),
      text: z.string(),
      hard_to_read: z.boolean(),
    }),
  ),
});

export type RosterEntry = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  position: string | null;
  grad_year: number | null;
  club_team: string | null;
};

// How confident the match is, after double-checking Claude's answer:
// "matched" (the name or number on the page fits), "check" (probably them,
// but the coach should confirm) or "unassigned".
export type MatchStatus = "matched" | "check" | "unassigned";

export type PageNote = {
  text: string;
  playerId: string | null;
  status: MatchStatus;
  // What identified the player on the page, e.g. "#7 Maya".
  writtenAs: string | null;
  hardToRead: boolean;
};

export async function readNotesPagePhoto(image: Image, roster: RosterEntry[]): Promise<PageNote[]> {
  const ids = roster.map((_, i) => `P${i + 1}`);
  const list = roster.length
    ? roster
        .map((p, i) => {
          const details = [p.position, p.grad_year, p.club_team].filter(Boolean).join(", ");
          return `${ids[i]}: ${p.jersey_number ? `#${p.jersey_number} ` : ""}${p.first_name} ${p.last_name}${details ? ` (${details})` : ""}`;
        })
        .join("\n")
    : "(no players have been added to this event yet)";

  const result = await readWithClaude(
    PageSchema,
    [
      imageBlock(image),
      {
        type: "text",
        text: `This is a photo of one page of handwritten notes a coach took while scouting at a showcase. A page usually covers several players, often identified by jersey number, name, or both.

Players at this event:
${list}

Split the page into one note per player, in the order they appear on the page. For each note:
- written_name / written_jersey: the name and jersey number the coach wrote for the player, exactly as written; null if not written.
- player and match: which listed player the note is about.
  - "sure": the written name and/or jersey number clearly identify one listed player. Set player to their id.
  - "unsure": probably a listed player, but something doesn't fit or more than one could fit (e.g. the number matches but the name doesn't, or a first name shared by two players). Set player to the most likely id.
  - "none": no listed player fits, or the note isn't about a player (e.g. notes about the event). Set player to null.
- text: the note, typed up.
- hard_to_read: true if you had to mark words with [?] or aren't sure of parts of the note.

${TEXT_RULES}

If the page has no handwritten notes, return an empty list.`,
      },
    ],
    MESSAGES,
  );

  const byId = new Map(roster.map((p, i) => [ids[i], p]));
  return result.notes
    .filter((n) => n.text.trim())
    .map((n) => {
      const writtenAs =
        [n.written_jersey && `#${n.written_jersey.replace(/^#/, "")}`, n.written_name].filter(Boolean).join(" ") || null;
      const { playerId, status } = checkMatch(n, n.player ? byId.get(n.player) : undefined, roster);
      return { text: n.text.trim(), playerId, status, writtenAs, hardToRead: n.hard_to_read };
    });
}

// ---- Double-checking a match against what's written on the page

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
const jerseyOf = (s: string | null | undefined) => norm(s).replace(/^0+(?=\d)/, "");

function nameFits(written: string | null, p: RosterEntry) {
  const words = (written ?? "").split(/[\s,.]+/).map(norm).filter(Boolean);
  if (!words.length) return false;
  const first = norm(p.first_name);
  const last = norm(p.last_name);
  // Every written word is the first name, last name, or an initial of one.
  return words.every((w) => w === first || w === last || (w.length === 1 && (first.startsWith(w) || last.startsWith(w))));
}

function checkMatch(
  note: { match: "sure" | "unsure" | "none"; written_name: string | null; written_jersey: string | null },
  suggested: RosterEntry | undefined,
  roster: RosterEntry[],
): { playerId: string | null; status: MatchStatus } {
  const jersey = jerseyOf(note.written_jersey);
  const jerseyFits = (p: RosterEntry) => Boolean(jersey) && jerseyOf(p.jersey_number) === jersey;
  // Players the writing points to on its own (number and name agree where
  // both are written).
  const fits = (p: RosterEntry) =>
    jersey && note.written_name
      ? jerseyFits(p) && nameFits(note.written_name, p)
      : jersey
        ? jerseyFits(p)
        : nameFits(note.written_name, p);

  if (suggested && note.match !== "none") {
    const agrees = fits(suggested);
    // "Sure" only stands if the page backs it up, and no one else fits too.
    const sure = note.match === "sure" && agrees && roster.filter(fits).length === 1;
    return { playerId: suggested.id, status: sure ? "matched" : "check" };
  }

  // Claude couldn't tell: suggest the one player the writing fits, if any.
  if (note.written_name || jersey) {
    const candidates = roster.filter(fits);
    if (candidates.length === 1) return { playerId: candidates[0].id, status: "check" };
  }
  return { playerId: null, status: "unassigned" };
}

// ---- Shared

type Image = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

const imageBlock = (image: Image) =>
  ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }) as const;

const MESSAGES = {
  badRequest: "That photo couldn't be read. Try taking it again.",
  refusal: "This photo couldn't be processed. Try another photo of the page.",
  tooLong: "There's too much on that page to read in one go. Try a closer photo of part of the page.",
};
