// GPA is stored exactly as the roster or coach gives it - a 4.0-scale value
// or a percentage - and never converted from one to the other. This tidies
// the formatting into the forms the database accepts:
//
//   4.0 scale   "3.6"   "3.85"          ranges   "3.5-3.8"
//   percentage  "85%"   "92.5%"                  "80%-90%"
//
// e.g. "80 – 90 %" -> "80%-90%", "3.5 to 3.8" -> "3.5-3.8", "85 %" -> "85%".

export type GpaResult = { ok: true; value: string | null } | { ok: false; error: string };

const NUM = String.raw`(\d{1,3}(?:\.\d{1,2})?)`;
const RANGE = new RegExp(String.raw`^${NUM}(%?)(?:-|–|—|to)${NUM}(%?)$`, "i");
const SINGLE = new RegExp(String.raw`^${NUM}(%?)$`);

const FORMAT_HELP = "Enter a GPA like 3.6 or a percentage like 85%";

// Keeps the number as written, minus stray leading zeros ("03.5" -> "3.5").
const tidy = (n: string) => n.replace(/^0+(?=\d)/, "");

export function normalizeGpa(input: string | null | undefined): GpaResult {
  const text = (input ?? "").trim();
  if (!text) return { ok: true, value: null };
  const compact = text.replace(/\s+/g, "");

  const range = RANGE.exec(compact);
  if (range) {
    const [, low, lowPct, high, highPct] = range;
    const percent = Boolean(lowPct || highPct);
    if (!percent && Number(low) <= 5 && Number(high) > 5) {
      return { ok: false, error: "Use the same kind on both sides (e.g. 3.5-3.8 or 80%-90%)" };
    }
    const tooHigh = [low, high].find((n) => Number(n) > (percent ? 100 : 5));
    if (tooHigh) return outOfRange(percent, tooHigh);
    if (Number(low) > Number(high)) return { ok: false, error: "Put the lower number first (e.g. 80%-90%)" };
    const unit = percent ? "%" : "";
    return { ok: true, value: `${tidy(low)}${unit}-${tidy(high)}${unit}` };
  }

  const single = SINGLE.exec(compact);
  if (single) {
    const [, value, pct] = single;
    const percent = Boolean(pct);
    if (Number(value) > (percent ? 100 : 5)) return outOfRange(percent, value);
    return { ok: true, value: `${tidy(value)}${percent ? "%" : ""}` };
  }

  return { ok: false, error: FORMAT_HELP };
}

function outOfRange(percent: boolean, value: string): GpaResult {
  if (percent) return { ok: false, error: "A percentage can't be over 100%" };
  // e.g. "92": far too high for a 4.0-scale GPA, so probably a percentage.
  if (Number(value) > 10) return { ok: false, error: `Add a % sign for a percentage (e.g. ${value}%)` };
  return { ok: false, error: "A 4.0-scale GPA can't be over 5" };
}

// For roster scanning: the GPA as Claude read it, tidied. If it isn't a
// 4.0-scale value or a percentage, it's left blank with a short note.
export function readRosterGpa(asWritten: string | null | undefined): { gpa: string; note: string | null } {
  const original = (asWritten ?? "").trim();
  // Labels like "weighted" or "W" aren't part of the value.
  const cleaned = original.replace(/\b(un)?weighted\b|\bu?w\b|\bgpa\b|[()]/gi, "").trim();
  const result = normalizeGpa(cleaned);
  if (result.ok) return { gpa: result.value ?? "", note: null };
  return { gpa: "", note: `Couldn't read GPA "${original}". Enter it manually.` };
}
