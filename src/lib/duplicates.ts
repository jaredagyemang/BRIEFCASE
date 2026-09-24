// Possible duplicate players: same first name + last name + grad year,
// ignoring capital letters and extra spaces. Two players with the same name
// and no grad year also count.

type NameAndYear = { first_name: string; last_name: string; grad_year: number | null };

export type DuplicateMatch = {
  id: string;
  name: string;
  // Short description to help tell them apart, e.g. "'27 · Midfielder · Solar SC".
  detail: string;
};

function normalize(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function duplicateKey(p: NameAndYear) {
  return `${normalize(p.first_name)}|${normalize(p.last_name)}|${p.grad_year ?? ""}`;
}

export function describePlayer(
  p: NameAndYear & { jersey_number?: string | null; position?: string | null; club_team?: string | null },
) {
  return [
    p.jersey_number && `#${p.jersey_number}`,
    p.grad_year && `'${String(p.grad_year).slice(-2)}`,
    p.position,
    p.club_team,
  ]
    .filter(Boolean)
    .join(" · ");
}

// For a list of players, the ids of every player that shares its key with
// at least one other player.
export function duplicateIds(players: (NameAndYear & { id: string })[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const p of players) {
    const key = duplicateKey(p);
    byKey.set(key, [...(byKey.get(key) ?? []), p.id]);
  }
  return new Set([...byKey.values()].filter((ids) => ids.length > 1).flat());
}
