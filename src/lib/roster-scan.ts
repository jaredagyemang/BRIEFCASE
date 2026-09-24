import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Reads a photo of a paper roster with Claude's vision and returns the
// players it can see as structured data.

const RosterSchema = z.object({
  team_name: z.string().nullable(),
  players: z.array(
    z.object({
      jersey_number: z.string().nullable(),
      first_name: z.string(),
      last_name: z.string(),
      position: z.string().nullable(),
      grad_year: z.number().int().nullable(),
      // Exactly as written ("3.6", "85%", "80%-90%"); the app converts it.
      gpa_as_written: z.string().nullable(),
      email: z.string().nullable(),
      // Only when the roster lists a club per player (e.g. showcase rosters).
      club_team: z.string().nullable(),
      // True when any part of the row was hard to read; the review screen
      // highlights these for a closer look.
      unclear: z.boolean(),
    }),
  ),
});

export type ScannedRoster = z.infer<typeof RosterSchema>;

const INSTRUCTIONS = `This is a photo of a sports team roster, taken on a phone at an event. It may be printed or handwritten, at an angle, or partly in shadow.

Extract every player row you can see, top to bottom:
- jersey_number: exactly as written (keep leading zeros like "00"); null if there isn't one.
- first_name / last_name: split the player's name. Rosters often write "Last, First" or put the last name in capitals; return normal capitalization (e.g. "McDonald", "O'Neil"). If only one name is legible, put it in last_name and leave first_name as "".
- position: as written on the roster (e.g. "MF", "GK", "Forward"); null if not listed.
- grad_year: the graduation year or class if the roster has one, as a 4-digit year ("'27" or "Class of 27" means 2027); null if not listed. Don't convert birth years or ages.
- gpa_as_written: the player's GPA or grade average copied exactly as written, including any % sign, range, or label (e.g. "3.6", "4.1 W", "85%", "80%-90%"). Don't convert or round it; null if not listed.
- email: the player's email address exactly as written; null if not listed. Don't include parent or coach emails.
- club_team: the player's club or team only if the roster has a per-player club/team column; otherwise null.
- unclear: true if you're unsure about any value in the row.

Set team_name to the team or club name if it's printed on the roster, otherwise null.

Only include people who are players - skip coaches, staff, headers, and totals. Never invent a player or a value you can't see; the coach will review everything before it's saved.`;

export class RosterScanError extends Error {}

export async function scanRosterImage(
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" },
): Promise<ScannedRoster> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new RosterScanError("Roster scanning isn't set up: ANTHROPIC_API_KEY is missing.");
  }

  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Reading a roster is straightforward extraction; medium effort keeps
      // the wait short at an event without giving up accuracy.
      output_config: { effort: "medium", format: betaZodOutputFormat(RosterSchema) },
      // If Claude declines the request, retry automatically on Anthropic's
      // recommended fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: INSTRUCTIONS },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Roster scan request failed", error);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new RosterScanError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new RosterScanError("Too many scans at once or out of credit. Try again in a minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new RosterScanError("That photo couldn't be read. Try taking it again.");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new RosterScanError("Couldn't reach the scanning service. Check your connection and try again.");
    }
    throw new RosterScanError("The scanning service had a problem. Try again in a moment.");
  }

  if (response.stop_reason === "refusal") {
    throw new RosterScanError("This photo couldn't be processed. Try another photo of the roster.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new RosterScanError("Couldn't read the whole roster. Try a closer photo of fewer rows.");
  }
  return response.parsed_output;
}
