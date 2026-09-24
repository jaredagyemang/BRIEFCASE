import Link from "next/link";
import { StatusSelect } from "@/components/status-select";
import { TRAFFIC_LIGHT_DOT } from "@/lib/players";
import { getPlayer } from "./data";

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const player = await getPlayer(id);

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
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-semibold">
          {player.first_name[0]}
          {player.last_name[0]}
          {player.traffic_light && (
            <span
              className={`absolute right-0 bottom-0 h-5 w-5 rounded-full border-4 border-background ${TRAFFIC_LIGHT_DOT[player.traffic_light]}`}
            />
          )}
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
