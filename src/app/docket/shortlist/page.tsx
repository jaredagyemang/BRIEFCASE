import Link from "next/link";
import { PageScroller } from "@/components/page-scroller";
import { RemoveFromShortlistButton } from "@/components/remove-from-shortlist-button";
import type { DocketInfo, InfoField } from "@/lib/gmail/docket-types";
import { PLATFORM_LABEL, type FoundLink } from "@/lib/gmail/links";
import { createClient } from "@/lib/supabase/server";

type ShortlistRow = {
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

// The Shortlist, shared by all staff. Each entry is a snapshot of a player's
// Info card and film links, taken when a coach shortlisted them from their
// Docket (other coaches can't see that coach's inbox).
export default async function ShortlistPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shortlist")
    .select("id, info, sender_name, sender_email, subject, email_date, links, created_at, adder:staff!shortlist_added_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .returns<ShortlistRow[]>();

  return (
    <PageScroller>
      <Link href="/docket" className="text-accent-ink">
        ‹ The Docket
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Shortlist</h1>
      <p className="text-muted">Shared with all staff. Add players with ☆ Shortlist on their Info card.</p>

      {error && <p className="mt-6 rounded-3xl bg-red/10 p-6 text-red">Couldn’t load the Shortlist: {error.message}</p>}
      {data?.length === 0 && (
        <p className="mt-6 rounded-3xl bg-surface p-8 text-center text-sm text-muted">Nobody on the Shortlist yet.</p>
      )}

      <ul className="mt-6 space-y-3">
        {data?.map((row) => {
          const name = row.info.name?.value ?? "Name not in the email";
          return (
            <li key={row.id} className="rounded-3xl bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg leading-tight font-semibold">
                  {row.info.name ? <Value field={row.info.name} /> : <span className="text-muted">{name}</span>}
                </h2>
                <RemoveFromShortlistButton id={row.id} name={name} />
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
                Added by {row.adder?.full_name ?? "a former staff member"} · {day(row.created_at)}
              </p>
            </li>
          );
        })}
      </ul>
    </PageScroller>
  );
}
