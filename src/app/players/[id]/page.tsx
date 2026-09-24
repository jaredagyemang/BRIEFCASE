import Link from "next/link";
import { RatingButtons } from "@/components/rating-buttons";
import { StatusSelect } from "@/components/status-select";
import { TASK_LABELS, TRAFFIC_LIGHTS, type TaskType, type TrafficLight } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { getPlayer } from "./data";

type RatingRow = {
  id: string;
  traffic_light_rating: TrafficLight;
  created_at: string;
  rater: { full_name: string } | null;
};

function lightFor(rating: TrafficLight) {
  return TRAFFIC_LIGHTS.find((l) => l.value === rating)!;
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const player = await getPlayer(id);

  const supabase = await createClient();
  const [{ data: ratings }, { data: openTasks }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("id, traffic_light_rating, created_at, rater:staff(full_name)")
      .eq("player_id", id)
      .not("traffic_light_rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<RatingRow[]>(),
    supabase
      .from("tasks")
      .select("id, task_type, created_at")
      .eq("player_id", id)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);
  const latestEval = ratings?.[0];
  const latestLight = TRAFFIC_LIGHTS.find((l) => l.value === player.traffic_light);

  const details = [
    { label: "Grad year", value: player.grad_year },
    { label: "Position", value: player.position },
    { label: "Club team", value: player.club_team },
    { label: "GPA", value: player.gpa?.toFixed(2) },
    { label: "Phone", value: player.phone },
    { label: "Email", value: player.email },
  ];

  const contactActions = [
    player.phone && { href: `tel:${player.phone}`, label: "Call", icon: "📞" },
    player.phone && { href: `sms:${player.phone}`, label: "Text", icon: "💬" },
    player.email && { href: `mailto:${player.email}`, label: "Email", icon: "✉️" },
  ].filter((a): a is { href: string; label: string; icon: string } => Boolean(a));

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/players" className="text-accent">
          ‹ Players
        </Link>
        <Link
          href={`/players/${player.id}/edit`}
          className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
        >
          Edit
        </Link>
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        {/* The avatar ring shows the player's latest rating. */}
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-semibold ${
            latestLight ? `ring-4 ring-offset-4 ring-offset-background ${latestLight.ring}` : ""
          }`}
        >
          {player.first_name[0]}
          {player.last_name[0]}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {player.first_name} {player.last_name}
        </h1>
        <p className="mt-0.5 text-muted">
          {[player.position, player.club_team].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-4">
          <StatusSelect playerId={player.id} status={player.lifecycle_status} />
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold">Rating</h2>
          {latestLight && (
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${latestLight.dot}`} />
              {latestLight.label}
              {latestEval && ` · ${timeAgo(latestEval.created_at)}`}
              {latestEval?.rater && ` · ${latestEval.rater.full_name}`}
            </span>
          )}
        </div>
        <RatingButtons playerId={player.id} rating={player.traffic_light} />
        {ratings && ratings.length > 1 && (
          <details className="group mt-3 rounded-2xl bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
              Rating history
              <span className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {ratings.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${lightFor(r.traffic_light_rating).dot}`} />
                  <span className="font-medium">{lightFor(r.traffic_light_rating).label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {r.rater?.full_name ?? "Shared login"}
                  </span>
                  <span className="shrink-0 text-muted">{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {openTasks && openTasks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {openTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium">{TASK_LABELS[task.task_type as TaskType]}</span>
                <span className="text-muted">{timeAgo(task.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {contactActions.length > 0 && (
        <div className="mt-6 flex justify-center gap-3">
          {contactActions.map((a) => (
            <a
              key={a.label}
              href={a.href}
              className="flex w-20 flex-col items-center gap-1 rounded-2xl bg-surface py-3 text-xs font-medium text-accent"
            >
              <span className="text-xl">{a.icon}</span>
              {a.label}
            </a>
          ))}
        </div>
      )}

      <dl className="mt-6 divide-y divide-border overflow-hidden rounded-3xl bg-surface">
        {details.map((d) => (
          <div key={d.label} className="flex justify-between gap-4 px-4 py-3.5">
            <dt className="text-muted">{d.label}</dt>
            <dd className="truncate text-right font-medium">{d.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
