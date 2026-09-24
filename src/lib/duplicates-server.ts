import "server-only";
import { createClient } from "@/lib/supabase/server";
import { describePlayer, duplicateKey, type DuplicateMatch } from "@/lib/duplicates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type NameAndYear = { first_name: string; last_name: string; grad_year: number | null };

type Candidate = NameAndYear & {
  id: string;
  jersey_number: string | null;
  position: string | null;
  club_team: string | null;
};

const CANDIDATE_COLUMNS = "id, first_name, last_name, jersey_number, grad_year, position, club_team";

function toMatch(c: Candidate): DuplicateMatch {
  return { id: c.id, name: `${c.first_name} ${c.last_name}`, detail: describePlayer(c) };
}

// Other players that look like the same person as `player`.
export async function findMatchingPlayers(
  supabase: Supabase,
  player: NameAndYear,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  // Narrow to the same grad year in the database, then compare names with
  // the same rules the player list uses.
  let query = supabase.from("players").select(CANDIDATE_COLUMNS);
  query = player.grad_year === null ? query.is("grad_year", null) : query.eq("grad_year", player.grad_year);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.returns<Candidate[]>();
  if (error) throw new Error(error.message);

  const key = duplicateKey(player);
  return data.filter((c) => duplicateKey(c) === key).map(toMatch);
}

// Existing matches for many players at once (e.g. a scanned roster), with a
// single database read. Returns one list per input, in the same order.
export async function findMatchesForMany(
  supabase: Supabase,
  players: NameAndYear[],
): Promise<DuplicateMatch[][]> {
  if (players.length === 0) return [];
  const { data, error } = await supabase.from("players").select(CANDIDATE_COLUMNS).returns<Candidate[]>();
  if (error) throw new Error(error.message);

  const byKey = new Map<string, DuplicateMatch[]>();
  for (const c of data) {
    const key = duplicateKey(c);
    byKey.set(key, [...(byKey.get(key) ?? []), toMatch(c)]);
  }
  return players.map((p) => byKey.get(duplicateKey(p)) ?? []);
}
