import "server-only";

import {
  ACTIVITY_PAGE_SIZE,
  RANGES,
  type ActivityAction,
  type ActivityEntry,
  type ActivityPage,
  type ReplyTemplate,
} from "@/lib/gmail/docket-types";
import { getCurrentUser } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Staff activity on The Docket: who shortlisted, shared, removed or turned
// down which player, recorded by the database (docket_activity).

type ActivityRow = {
  id: string;
  actor_id: string | null;
  action: ActivityAction;
  reply_template: ReplyTemplate | null;
  player_name: string | null;
  note: string | null;
  source_staff_id: string | null;
  gmail_message_id: string;
  created_at: string;
  actor: { full_name: string } | null;
  source: { full_name: string } | null;
};

const COLUMNS =
  "id, actor_id, action, reply_template, player_name, note, source_staff_id, gmail_message_id, created_at, " +
  "actor:staff!docket_activity_actor_id_fkey(full_name), source:staff!docket_activity_source_staff_id_fkey(full_name)";

function toEntry(row: ActivityRow, me: string): ActivityEntry {
  return {
    id: row.id,
    actor: row.actor_id === me ? "You" : (row.actor?.full_name ?? "A former staff member"),
    action: row.action,
    template: row.reply_template,
    player: row.player_name,
    note: row.note,
    at: row.created_at,
    // From this coach's own inbox: their live Info card. Otherwise the
    // entry's page (the shared copy, if there is one).
    href:
      row.source_staff_id === me
        ? `/docket/card/${encodeURIComponent(row.gmail_message_id)}?from=activity`
        : `/docket/activity/${row.id}`,
  };
}

// The latest activity within the last `hours` (one of The Docket's ranges),
// newest first, a page at a time (`before`: the time of the last one shown).
export async function loadStaffActivity(hours: number, before?: string | null): Promise<ActivityPage> {
  if (!RANGES.some((r) => r.hours === hours)) return { status: "error", message: "Unknown time range." };
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "You've been signed out. Sign in again." };
  const supabase = await createClient();
  let query = supabase
    .from("docket_activity")
    .select(COLUMNS)
    .gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE + 1);
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt("created_at", before);
  const { data, error } = await query.returns<ActivityRow[]>();
  if (error) {
    console.error("Loading staff activity failed", error.message);
    return { status: "error", message: "Couldn’t load staff activity. Try again." };
  }
  const rows = data ?? [];
  return {
    status: "ok",
    entries: rows.slice(0, ACTIVITY_PAGE_SIZE).map((r) => toEntry(r, user.id)),
    more: rows.length > ACTIVITY_PAGE_SIZE,
  };
}

// One entry, for its page: the entry, whose inbox it came from, and the
// shared copy of its Info card (Shared with team or the Shortlist), if any.
export async function loadActivityEntry(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: row } = await supabase.from("docket_activity").select(COLUMNS).eq("id", id).maybeSingle<ActivityRow>();
  if (!row) return null;
  const mine = row.source_staff_id === user.id;
  let shared: { list: "shared" | "shortlist"; id: string } | null = null;
  if (!mine && row.source_staff_id) {
    for (const [list, table] of [
      ["shared", "team_shares"],
      ["shortlist", "shortlist"],
    ] as const) {
      const { data } = await supabase
        .from(table)
        .select("id")
        .eq("source_staff_id", row.source_staff_id)
        .eq("gmail_message_id", row.gmail_message_id)
        .maybeSingle<{ id: string }>();
      if (data) {
        shared = { list, id: data.id };
        break;
      }
    }
  }
  return {
    entry: toEntry(row, user.id),
    mine,
    messageId: row.gmail_message_id,
    // Whose inbox it's in.
    sourceName: row.source?.full_name ?? null,
    shared,
  };
}
