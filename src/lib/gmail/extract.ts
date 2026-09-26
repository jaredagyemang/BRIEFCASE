import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { DocketInfo } from "./docket-types";

// Reads a recruiting email with Claude and pulls out the Info card fields.
// The rule that matters most: never guess. A field the email doesn't mention
// is null, and anything worked out indirectly is marked "inferred" so the
// card can say "Possibly … — verify, AI may be wrong".

export const EXTRACTION_MODEL = "claude-sonnet-5";

const Field = z
  .object({
    value: z.string(),
    source: z.enum(["stated", "inferred"]),
  })
  .nullable();

const InfoSchema = z.object({
  name: Field,
  position: Field,
  grad_year: Field,
  club: Field,
  gpa: Field,
  major: Field,
  budget: Field,
  more_players: z.boolean(),
});

const INSTRUCTIONS = `You are helping a college sports recruiting coach triage their inbox. Below is one email. Pull out the details of the recruit (the player being recommended or introducing themselves) for a quick-glance card.

Fields:
- name: the recruit's full name.
- position: the position(s) they play, as the email puts it (e.g. "Center back", "GK", "Winger / attacking mid").
- grad_year: their high school graduation year / class as a 4-digit year (e.g. "2027").
- club: their club team (not their high school), e.g. "Solar SC 08G ECNL".
- gpa: exactly as written, on whatever scale the email uses ("3.8", "3.8 unweighted", "92%"). Never convert between a 4.0 scale and a percentage, and don't round.
- major: the intended college major. If the email says they're undecided, use "Undecided".
- budget: what the family can pay / the budget mentioned, exactly as written, whether a flat number or a range (e.g. "$25,000", "$20k–30k per year").
- more_players: true if the email is about more than one recruit (then fill the fields for the first one only).

For every field, choose exactly one:
- null: the email doesn't give this. Leave it out rather than guess. A blank field is much better than a wrong one.
- {"value": ..., "source": "stated"}: the email states it plainly (the value is written in the email, possibly in a signature or attached profile text).
- {"value": ..., "source": "inferred"}: you worked it out indirectly, and it could be wrong. Examples: a grad year from "she's a junior" or from a club age group like "08G"; a position from "he scores a lot of goals"; a club from an email address domain; a name from an email address. Use this sparingly; if the clue is weak, use null.

The sender may be the recruit themselves, a parent, or a coach/club director; the recruit's name is not necessarily the sender's. If the email isn't about a recruit at all (a newsletter, a platform notification with no player details, etc.), return null for every field and more_players false.

Only use what's in this email. Never invent details.`;

export class ExtractionError extends Error {}

export async function extractInfo(email: { from: string; subject: string; date: string | null; text: string }): Promise<DocketInfo> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError("Info cards aren't set up: ANTHROPIC_API_KEY is missing.");
  }
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });

  const content = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    email.date ? `Date: ${email.date}` : null,
    "",
    // Long threads and signatures rarely add anything past this.
    email.text.slice(0, 20_000),
  ]
    .filter((line) => line !== null)
    .join("\n");

  let response;
  try {
    response = await client.beta.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(InfoSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTIONS },
            { type: "text", text: `<email>\n${content}\n</email>` },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Info card extraction failed", error);
    throw new ExtractionError("Couldn't read this email right now.");
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new ExtractionError("Couldn't read this email.");
  }
  return tidy(response.parsed_output);
}

// Blank strings count as "not mentioned".
function tidy(info: DocketInfo): DocketInfo {
  const clean = (f: DocketInfo["name"]) => (f && f.value.trim() ? { value: f.value.trim(), source: f.source } : null);
  return {
    name: clean(info.name),
    position: clean(info.position),
    grad_year: clean(info.grad_year),
    club: clean(info.club),
    gpa: clean(info.gpa),
    major: clean(info.major),
    budget: clean(info.budget),
    more_players: Boolean(info.more_players),
  };
}
