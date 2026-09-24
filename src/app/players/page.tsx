import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  LIFECYCLE_STATUSES,
  TRAFFIC_LIGHT_DOT,
  isLifecycleStatus,
  type Player,
} from "@/lib/players";
import { StatusPill } from "@/components/status-pill";
import { SearchBox } from "@/components/search-box";

type ListPlayer = Pick<
  Player,
  "id" | "first_name" | "last_name" | "grad_year" | "position" | "club_team" | "lifecycle_status" | "traffic_light"
>;

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = isLifecycleStatus(params.status) ? params.status : null;

  const supabase = await createClient();
  let query = supabase
    .from("players")
    .select("id, first_name, last_name, grad_year, position, club_team, lifecycle_status, traffic_light")
    .order("last_name")
    .order("first_name")
    .limit(500);

  // Default view hides archived players; pick the Archived chip to see them.
  query = status ? query.eq("lifecycle_status", status) : query.neq("lifecycle_status", "archived");

  // Strip characters that have meaning in PostgREST filter syntax.
  const term = q.replace(/[%,()*\\]/g, " ").trim();
  if (term) {
    query = query.or(
      ["first_name", "last_name", "club_team", "position"]
        .map((col) => `${col}.ilike.%${term}%`)
        .join(","),
    );
  }

  const { data, error } = await query.returns<ListPlayer[]>();
  const players = data ?? [];

  function chipHref(value: string | null) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (value) next.set("status", value);
    const s = next.toString();
    return s ? `/players?${s}` : "/players";
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Players</h1>
        <Link
          href="/players/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Add
        </Link>
      </div>

      <div className="mt-4">
        <Suspense>
          <SearchBox placeholder="Search name, club, position" label="Search players" />
        </Suspense>
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[{ value: null, label: "Active" }, ...LIFECYCLE_STATUSES].map((chip) => {
          const active = chip.value === status;
          return (
            <Link
              key={chip.value ?? "active"}
              href={chipHref(chip.value)}
              scroll={false}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "bg-foreground text-background" : "bg-surface-muted text-muted"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <p className="mt-6 rounded-3xl bg-red/10 p-6 text-red">Couldn&apos;t load players: {error.message}</p>
      ) : players.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-surface p-10 text-center">
          <p className="text-4xl">🏃</p>
          <p className="mt-3 font-semibold">{q || status ? "No matching players" : "No players yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {q || status ? "Try a different search or filter." : "Add your first recruit to get started."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-3xl bg-surface">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                href={`/players/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-surface-muted sm:hover:bg-surface-muted"
              >
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold">
                  {p.first_name[0]}
                  {p.last_name[0]}
                  {p.traffic_light && (
                    <span
                      className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${TRAFFIC_LIGHT_DOT[p.traffic_light]}`}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[p.grad_year && `'${String(p.grad_year).slice(-2)}`, p.position, p.club_team]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                </div>
                <StatusPill status={p.lifecycle_status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
