import "server-only";
import { createClient } from "@/lib/supabase/server";
import { describePlayer, duplicateKey, type DuplicateMatch } from "@/lib/duplicates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Candidate = {
  id: string;
  first_name: string;
  last_name: string;
  grad_year: number | null;
  position: string | null;
  club_team: string | null;
};

// Other players that look like the same person as `player`.
export async function findMatchingPlayers(
  supabase: Supabase,
  player: { first_name: string; last_name: string; grad_year: number | null },
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  // Narrow to the same grad year in the database, then compare names with
  // the same rules the player list uses.
  let query = supabase.from("players").select("id, first_name, last_name, grad_year, position, club_team");
  query = player.grad_year === null ? query.is("grad_year", null) : query.eq("grad_year", player.grad_year);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.returns<Candidate[]>();
  if (error) throw new Error(error.message);

  const key = duplicateKey(player);
  return data
    .filter((c) => duplicateKey(c) === key)
    .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, detail: describePlayer(c) }));
}
