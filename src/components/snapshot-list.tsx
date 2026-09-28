import { RemoveFromListButton } from "@/components/remove-from-list-button";
import type { SnapshotList } from "@/lib/gmail/docket";
import type { DocketInfo, InfoField } from "@/lib/gmail/docket-types";
import { PLATFORM_LABEL, type FoundLink } from "@/lib/gmail/links";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

// A list of Info card snapshots shared by all staff: the Shortlist and
// "Shared with team". Each entry was copied from a coach's Docket (other
// coaches can't see that coach's inbox), newest first.

type SnapshotRow = {
  id: string;
  info: DocketInfo;
  sender_name: string | null;
  sender_email: string | null;
  subject: string | null;
  email_date: string | null;
  links: FoundLink[];
  created_at: string;
  adder: { full_name: string } | null;
};

const FIELDS = [
  ["position", "Position"],
  ["grad_year", "Grad year"],
  ["club", "Club"],
  ["gpa", "GPA"],
  ["major", "Major"],
  ["budget", "Budget"],
] as const;

function Value({ field }: { field: InfoField }) {
  if (!field) return <span className="text-muted">—</span>;
  if (field.source === "stated") return <span>{field.value}</span>;
  return (
    <span className="text-accent-ink">
      Possibly {field.value}
      <span className="block text-xs font-normal">— verify, AI may be wrong</span>
    </span>
  );
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

const TABLE: Record<SnapshotList, { table: string; fkey: string }> = {
  shortlist: { table: "shortlist", fkey: "shortlist_added_by_fkey" },
  shared: { table: "team_shares", fkey: "team_shares_added_by_fkey" },
};

export async function SnapshotListView({
  list,
  empty,
  addedLabel,
}: {
  list: SnapshotList;
  empty: string;
  addedLabel: string;
}) {
  const supabase = await createClient();
  const { table, fkey } = TABLE[list];
  const { data, error } = await supabase
    .from(table)
    .select(
      `id, info, sender_name, sender_email, subject, email_date, links, created_at, adder:staff!${fkey}(full_name)`,
    )
    .order("created_at", { ascending: false })
    .returns<SnapshotRow[]>();
  const rows = data ?? [];

  if (error) return <p className="mt-6 rounded-3xl bg-red/10 p-6 text-red">Couldn’t load the list: {error.message}</p>;
  if (rows.length === 0)
    return <p className="mt-6 rounded-3xl bg-surface p-8 text-center text-sm text-muted">{empty}</p>;

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => {
        const name = row.info.name?.value ?? "Name not in the email";
        return (
          <li key={row.id} className="rounded-3xl bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg leading-tight font-semibold">
                {row.info.name ? <Value field={row.info.name} /> : <span className="text-muted">{name}</span>}
              </h2>
              <RemoveFromListButton list={list} id={row.id} name={name} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {FIELDS.map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
                  <dd className="font-medium break-words">
                    <Value field={row.info[key]} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">
              From <span className="font-medium text-foreground">{row.sender_name ?? "Unknown sender"}</span>
              {row.sender_email && row.sender_email !== row.sender_name && ` · ${row.sender_email}`}
              {row.email_date && ` · ${day(row.email_date)}`}
            </p>
            {row.subject && <p className="truncate text-sm text-muted">{row.subject}</p>}
            {row.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-surface-muted px-3 py-1.5 text-sm font-semibold text-accent-ink"
                  >
                    {PLATFORM_LABEL[link.platform]} ↗
                  </a>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              {addedLabel} {row.adder?.full_name ?? "a former staff member"} · {timeAgo(row.created_at)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
