// Turns a GPA as written on a roster into a 0-5 GPA for the players table.
//
// - A plain GPA ("3.6", "4.2 weighted") is used as-is.
// - A percentage ("85%") is converted with the common College Board
//   percent-to-4.0 table. Schools' scales vary, so it's flagged for review.
// - A range ("3.5-3.8", "80%-90%") uses its midpoint and is flagged too.
// - Anything else ("92" with no %, letter grades, text) is left blank and
//   flagged for manual entry rather than guessed.

export type GpaReading = {
  // Value for the GPA field, as text ("" when it needs manual entry).
  gpa: string;
  // Shown on the review screen when the value should be checked or entered.
  note: string | null;
};

// College Board percent → 4.0 scale.
const PERCENT_TABLE: [minPercent: number, gpa: number][] = [
  [93, 4.0],
  [90, 3.7],
  [87, 3.3],
  [83, 3.0],
  [80, 2.7],
  [77, 2.3],
  [73, 2.0],
  [70, 1.7],
  [67, 1.3],
  [65, 1.0],
  [0, 0.0],
];

export function percentToGpa(percent: number): number {
  return PERCENT_TABLE.find(([min]) => percent >= min)![1];
}

const NUMBER = String.raw`(\d{1,3}(?:\.\d+)?)`;
const RANGE = new RegExp(String.raw`^${NUMBER}\s*(%?)\s*(?:-|–|—|to)\s*${NUMBER}\s*(%?)$`, "i");
const SINGLE = new RegExp(String.raw`^${NUMBER}\s*(%?)$`);

// Up to two decimals, with at least one (3 -> "3.0", 3.65 -> "3.65").
const round2 = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

export function readGpa(asWritten: string | null | undefined): GpaReading {
  const original = (asWritten ?? "").trim();
  if (!original) return { gpa: "", note: null };

  // Ignore trailing labels like "weighted", "unweighted", "GPA".
  const text = original.replace(/\b(un)?weighted\b|\bgpa\b|[()]/gi, "").trim();
  const manual = { gpa: "", note: `GPA "${original}" couldn't be converted. Enter it manually.` };

  const range = RANGE.exec(text);
  if (range) {
    const [, a, pa, b, pb] = range;
    const low = Number(a);
    const high = Number(b);
    const isPercent = Boolean(pa || pb);
    if (low > high) return manual;
    if (isPercent) {
      if (high > 100) return manual;
      const mid = (low + high) / 2;
      return {
        gpa: round2(percentToGpa(mid)),
        note: `GPA converted from ${original} (midpoint ${Math.round(mid * 100) / 100}%). Check it.`,
      };
    }
    if (high <= 5) {
      return { gpa: round2((low + high) / 2), note: `GPA is the midpoint of ${original}. Check it.` };
    }
    return manual;
  }

  const single = SINGLE.exec(text);
  if (single) {
    const value = Number(single[1]);
    if (single[2]) {
      if (value > 100) return manual;
      return { gpa: round2(percentToGpa(value)), note: `GPA converted from ${original}. Check it.` };
    }
    if (value <= 5) return { gpa: round2(value), note: null };
    return manual; // e.g. "92": probably a percentage, but not certain.
  }

  return manual;
}
