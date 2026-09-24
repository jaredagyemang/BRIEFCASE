import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import type { Coach } from "@/lib/coaches";
import { createClient } from "@/lib/supabase/server";

type ListCoach = Pick<Coach, "id" | "first_name" | "last_name" | "title" | "email">;

export default async function CoachesPage({ searchParams }: PageProps<"/coaches">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  let query = supabase
    .from("coaches")
    .select("id, first_name, last_name, title, email")
    .order("last_name")
    .order("first_name")
    .limit(500);

  // Strip characters that have meaning in PostgREST filter syntax.
  const term = q.replace(/[%,()*\\]/g, " ").trim();
  if (term) {
    query = query.or(
      ["first_name", "last_name", "title", "email"].map((col) => `${col}.ilike.%${term}%`).join(","),
    );
  }

  const { data, error } = await query.returns<ListCoach[]>();
  const coaches = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Coaches</h1>
        <Link
          href="/coaches/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Add
        </Link>
      </div>

      <div className="mt-4">
        <Suspense>
          <SearchBox placeholder="Search name, title, email" label="Search coaches" />
        </Suspense>
      </div>

      {error ? (
        <p className="mt-6 rounded-3xl bg-red/10 p-6 text-red">Couldn&apos;t load coaches: {error.message}</p>
      ) : coaches.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-surface p-10 text-center">
          <p className="text-4xl">📇</p>
          <p className="mt-3 font-semibold">{q ? "No matching coaches" : "No coaches yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {q ? "Try a different search." : "Add the college coaches you're in touch with."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-3xl bg-surface">
          {coaches.map((c) => (
            <li key={c.id}>
              <Link
                href={`/coaches/${c.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-surface-muted sm:hover:bg-surface-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold">
                  {c.first_name[0]}
                  {c.last_name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[c.title, c.email].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                </div>
                <span className="text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
