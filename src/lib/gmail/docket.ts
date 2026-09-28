import "server-only";
import {
  ConnectionExpiredError,
  header,
  bodyText,
  loadConnection,
  parseAddress,
  readableText,
  withGmail,
} from "./connection";
import {
  DECLINING,
  REPLY_TEMPLATES,
  cleanSearch,
  isCurrentInfo,
  type CardResult,
  type CardStatus,
  type GmailSearchResult,
  type SearchResult,
  type DocketEmail,
  type DocketInfo,
  SHARE_NOTE_MAX,
  type DocketResult,
  type ReplyTemplate,
} from "./docket-types";
import { EXTRACTION_MODEL, extractInfo } from "./extract";
import {
  GMAIL_MODIFY,
  GMAIL_SEND,
  GmailNotFoundError,
  GmailScopeError,
  getMessage,
  listMessageIds,
  sendMessage,
  trashMessage,
  type GmailMessage,
} from "./google";
import { extractLinks, uniqueMedia } from "./links";

// The Docket: recent emails with film links, each with an Info card the AI
// reads from the email, plus replies, skipping and the shared Shortlist.

export const LOOKBACK_DAYS = 30;
export const MAX_EMAILS = 100;
// Gmail search narrows the emails down; each one is then read to pull out the
// actual links (search matches loosely, e.g. a mention of "youtube.com").
const LINK_SITES = "{youtube.com youtu.be hudl.com veo.co docs.google.com}";
const SEARCH = `newer_than:${LOOKBACK_DAYS}d ${LINK_SITES}`;
const ITEM_COLUMNS = "gmail_message_id, extraction, skipped_at, replied_at, reply_template, sender_name, email_date";

type ItemRow = {
  gmail_message_id: string;
  extraction: DocketInfo | null;
  skipped_at: string | null;
  replied_at: string | null;
  reply_template: ReplyTemplate | null;
  sender_name: string | null;
  email_date: string | null;
};

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return results;
}

const describe = (m: GmailMessage) => {
  const from = parseAddress(header(m.payload, "From"));
  return {
    from: from.name || "Unknown sender",
    fromEmail: from.email,
    subject: header(m.payload, "Subject") || "(no subject)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
  };
};

// Sender, subject and date as saved with a card (for search).
const details = (m: GmailMessage) => {
  const { from, fromEmail, subject, date } = describe(m);
  return { sender_name: from, sender_email: fromEmail, subject, email_date: date };
};

type Supabase = NonNullable<Awaited<ReturnType<typeof loadConnection>>>["supabase"];

async function saveDetails(supabase: Supabase, staffId: string, messages: GmailMessage[]) {
  if (!messages.length) return;
  const { error } = await supabase.from("docket_items").upsert(
    messages.map((m) => ({ staff_id: staffId, gmail_message_id: m.id, gmail_thread_id: m.threadId, ...details(m) })),
  );
  if (error) console.error("Couldn't save email details", error.message);
}

// Where a card stands: in the feed, or why not.
function cardStatus(item: Pick<ItemRow, "skipped_at" | "reply_template" | "extraction"> | undefined, date: string | null): CardStatus {
  if (item?.skipped_at) return { kind: "skipped" };
  if (item?.reply_template && DECLINING.includes(item.reply_template)) return { kind: "declined", template: item.reply_template };
  if (item?.extraction?.recruiting === "no") return { kind: "not_recruiting" };
  if (date && Date.now() - Date.parse(date) > LOOKBACK_DAYS * 24 * 3600_000) return { kind: "older" };
  return { kind: "feed" };
}

// Which of these emails this coach has shortlisted or shared.
async function listFlags(supabase: Supabase, staffId: string, ids: string[]) {
  if (!ids.length) return { shortlisted: new Set<string>(), shared: new Set<string>() };
  const [{ data: s1 }, { data: s2 }] = await Promise.all([
    supabase.from("shortlist").select("gmail_message_id").eq("source_staff_id", staffId).in("gmail_message_id", ids),
    supabase.from("team_shares").select("gmail_message_id").eq("source_staff_id", staffId).in("gmail_message_id", ids),
  ]);
  return {
    shortlisted: new Set((s1 ?? []).map((r) => r.gmail_message_id as string)),
    shared: new Set((s2 ?? []).map((r) => r.gmail_message_id as string)),
  };
}

function failure(error: unknown): DocketResult {
  if (error instanceof ConnectionExpiredError) return { status: "expired" };
  console.error("Reading Gmail failed", error);
  return { status: "error", message: error instanceof Error ? error.message : "Couldn't read Gmail." };
}

// --- The feed ------------------------------------------------------------------

export async function loadDocket(): Promise<DocketResult> {
  const connection = await loadConnection();
  if (!connection) return { status: "not_connected" };
  const { supabase, row } = connection;
  try {
    const messages = await withGmail(connection, async (token) => {
      const ids = await listMessageIds(token, SEARCH, MAX_EMAILS);
      return inBatches(ids, 10, (id) => getMessage(token, id));
    });
    const ids = messages.map((m) => m.id);
    const [{ data: items }, { data: shortlisted }, { data: shared }] = await Promise.all([
      supabase
        .from("docket_items")
        .select(ITEM_COLUMNS)
        .in("gmail_message_id", ids)
        .returns<ItemRow[]>(),
      supabase
        .from("shortlist")
        .select("gmail_message_id")
        .eq("source_staff_id", row.staff_id)
        .in("gmail_message_id", ids)
        .returns<{ gmail_message_id: string }[]>(),
      supabase
        .from("team_shares")
        .select("gmail_message_id")
        .eq("source_staff_id", row.staff_id)
        .in("gmail_message_id", ids)
        .returns<{ gmail_message_id: string }[]>(),
    ]);
    const byId = new Map((items ?? []).map((i) => [i.gmail_message_id, i]));
    const onShortlist = new Set((shortlisted ?? []).map((s) => s.gmail_message_id));
    const onShared = new Set((shared ?? []).map((s) => s.gmail_message_id));
    // Cards read before sender and subject were saved: fill them in now, so
    // search can show and match them.
    await saveDetails(
      supabase,
      row.staff_id,
      messages.filter((m) => byId.has(m.id) && !byId.get(m.id)!.sender_name),
    );

    const emails = messages
      .map((m): DocketEmail => {
        const item = byId.get(m.id);
        return {
          id: m.id,
          threadId: m.threadId,
          ...describe(m),
          links: extractLinks(bodyText(m.payload)),
          // Cards saved before the recruiting check existed get read again.
          info: isCurrentInfo(item?.extraction) ? item.extraction : null,
          replied: item?.replied_at && item.reply_template ? { template: item.reply_template, at: item.replied_at } : null,
          shortlisted: onShortlist.has(m.id),
          shared: onShared.has(m.id),
        };
      })
      .filter((e) => {
        const item = byId.get(e.id);
        // Skipped or deleted, turned down with a reply, or not a recruiting
        // email at all: out of The Docket.
        return (
          e.links.length > 0 &&
          !item?.skipped_at &&
          !(item?.reply_template && DECLINING.includes(item.reply_template)) &&
          e.info?.recruiting !== "no"
        );
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    return {
      status: "ok",
      googleEmail: row.google_email,
      canSend: row.scopes.split(" ").includes(GMAIL_SEND),
      canDelete: row.scopes.split(" ").includes(GMAIL_MODIFY),
      emails,
      scanned: messages.length,
    };
  } catch (error) {
    return failure(error);
  }
}

// --- Info cards ------------------------------------------------------------------

// Reads the given emails with the AI and saves the Info cards (each email is
// only ever read once). Returns each card, or null where reading failed.
export async function extractInfoCards(messageIds: string[]): Promise<Record<string, DocketInfo | null>> {
  const connection = await loadConnection();
  if (!connection) return {};
  const { supabase, row } = connection;
  const ids = [...new Set(messageIds)].slice(0, 8);

  // Already read (e.g. in another tab): use that.
  const { data: done } = await supabase
    .from("docket_items")
    .select("gmail_message_id, extraction")
    .in("gmail_message_id", ids)
    .not("extraction", "is", null)
    .returns<Pick<ItemRow, "gmail_message_id" | "extraction">[]>();
  const result: Record<string, DocketInfo | null> = Object.fromEntries(
    (done ?? []).filter((d) => isCurrentInfo(d.extraction)).map((d) => [d.gmail_message_id, d.extraction]),
  );

  const todo = ids.filter((id) => !(id in result));
  await Promise.all(
    todo.map(async (id) => {
      try {
        const message = await withGmail(connection, (token) => getMessage(token, id));
        const { from, fromEmail, subject, date } = describe(message);
        const info = await extractInfo({
          from: fromEmail ? `${from} <${fromEmail}>` : from,
          subject,
          date,
          text: readableText(message.payload),
        });
        const { error } = await supabase.from("docket_items").upsert({
          staff_id: row.staff_id,
          gmail_message_id: id,
          gmail_thread_id: message.threadId,
          ...details(message),
          extraction: info,
          extraction_model: EXTRACTION_MODEL,
          extracted_at: new Date().toISOString(),
        });
        if (error) console.error("Couldn't save Info card", error.message);
        result[id] = info;
      } catch (error) {
        console.error("Couldn't read email for Info card", id, error);
        result[id] = null;
      }
    }),
  );
  return result;
}

// --- Skip -----------------------------------------------------------------------

export async function setSkipped(messageId: string, threadId: string, skipped: boolean) {
  const connection = await loadConnection();
  if (!connection) throw new Error("Gmail isn't connected.");
  const { supabase, row } = connection;
  const { error } = await supabase.from("docket_items").upsert({
    staff_id: row.staff_id,
    gmail_message_id: messageId,
    gmail_thread_id: threadId,
    skipped_at: skipped ? new Date().toISOString() : null,
  });
  if (error) throw new Error(`Couldn't update the Docket: ${error.message}`);
}

// --- Replies ----------------------------------------------------------------------

// Header values come from the original email; never let them carry line
// breaks into the reply's headers.
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

// Non-ASCII subjects need RFC 2047 encoding.
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

function replyMime(original: GmailMessage, body: string) {
  const replyTo = oneLine(header(original.payload, "Reply-To")) || oneLine(header(original.payload, "From"));
  const subject = oneLine(header(original.payload, "Subject"));
  const messageId = oneLine(header(original.payload, "Message-ID") || header(original.payload, "Message-Id"));
  const references = oneLine(header(original.payload, "References"));
  const lines = [
    `To: ${replyTo}`,
    `Subject: ${encodeHeader(/^re:/i.test(subject) ? subject : `Re: ${subject}`)}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${[references, messageId].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    (Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export type ReplyResult = { ok: true } | { ok: false; reason: "reconnect" | "error"; message: string };

export async function sendReply(messageId: string, template: ReplyTemplate, body: string): Promise<ReplyResult> {
  if (!REPLY_TEMPLATES.includes(template)) return { ok: false, reason: "error", message: "Unknown reply." };
  const text = body.trim();
  if (!text) return { ok: false, reason: "error", message: "The reply is empty." };
  if (text.length > 10_000) return { ok: false, reason: "error", message: "That reply is too long." };

  const connection = await loadConnection();
  if (!connection) return { ok: false, reason: "reconnect", message: "Connect Gmail to send replies." };
  const { supabase, row } = connection;
  if (!row.scopes.split(" ").includes(GMAIL_SEND)) {
    return { ok: false, reason: "reconnect", message: "Reconnect Gmail to allow sending replies." };
  }

  try {
    const original = await withGmail(connection, (token) => getMessage(token, messageId));
    await withGmail(connection, (token) => sendMessage(token, replyMime(original, text), original.threadId));
    const { error } = await supabase.from("docket_items").upsert({
      staff_id: row.staff_id,
      gmail_message_id: messageId,
      gmail_thread_id: original.threadId,
      replied_at: new Date().toISOString(),
      reply_template: template,
    });
    if (error) console.error("Reply sent but not recorded", error.message);
    return { ok: true };
  } catch (error) {
    if (error instanceof GmailScopeError || error instanceof ConnectionExpiredError) {
      return { ok: false, reason: "reconnect", message: "Reconnect Gmail to allow sending replies." };
    }
    console.error("Sending reply failed", error);
    return { ok: false, reason: "error", message: "Couldn't send the reply. Try again." };
  }
}

// --- Shortlist and "Shared with team" (both seen by all staff) ---------------------

// Each is a separate list of snapshots with the same shape: an email can be
// on either, both, or neither.
export type SnapshotList = "shortlist" | "shared";
export const SNAPSHOT_TABLE: Record<SnapshotList, "shortlist" | "team_shares"> = {
  shortlist: "shortlist",
  shared: "team_shares",
};
const LIST_NAME: Record<SnapshotList, string> = { shortlist: "the Shortlist", shared: "Shared with team" };

export async function setShortlisted(messageId: string, shortlisted: boolean) {
  return setOnList("shortlist", messageId, shortlisted);
}

// `note`: an optional message for the team, shown on the shared list.
export async function setShared(messageId: string, shared: boolean, note?: string | null) {
  return setOnList("shared", messageId, shared, note);
}

async function setOnList(list: SnapshotList, messageId: string, on: boolean, note?: string | null) {
  const connection = await loadConnection();
  if (!connection) throw new Error("Gmail isn't connected.");
  const { supabase, row } = connection;
  const table = SNAPSHOT_TABLE[list];

  if (!on) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("source_staff_id", row.staff_id)
      .eq("gmail_message_id", messageId);
    if (error) throw new Error(`Couldn't update ${LIST_NAME[list]}: ${error.message}`);
    return;
  }

  // Other coaches can't see this inbox, so copy what they need to see.
  const message = await withGmail(connection, (token) => getMessage(token, messageId));
  const { data: item } = await supabase
    .from("docket_items")
    .select("extraction")
    .eq("gmail_message_id", messageId)
    .maybeSingle<Pick<ItemRow, "extraction">>();
  const { from, fromEmail, subject, date } = describe(message);
  const { error } = await supabase.from(table).upsert(
    {
      source_staff_id: row.staff_id,
      gmail_message_id: messageId,
      info: item?.extraction ?? emptyInfo(),
      sender_name: from,
      sender_email: fromEmail,
      subject,
      email_date: date,
      links: uniqueMedia(extractLinks(bodyText(message.payload))),
      added_by: row.staff_id,
      ...(list === "shared" && { note: note?.trim().slice(0, SHARE_NOTE_MAX) || null }),
    },
    { onConflict: "source_staff_id,gmail_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Couldn't update ${LIST_NAME[list]}: ${error.message}`);
}

export function emptyInfo(): DocketInfo {
  return {
    name: null,
    position: null,
    grad_year: null,
    club: null,
    gpa: null,
    major: null,
    budget: null,
    more_players: false,
    recruiting: "unsure",
  };
}

// --- Delete (move to Gmail's Trash) --------------------------------------------------

export type DeleteResult = { ok: true } | { ok: false; reason: "reconnect" | "error"; message: string };

// Moves the email to the coach's Gmail Trash (Gmail deletes it for good after
// 30 days) and takes it out of The Docket.
export async function trashEmail(messageId: string, threadId: string): Promise<DeleteResult> {
  const connection = await loadConnection();
  if (!connection) return { ok: false, reason: "reconnect", message: "Connect Gmail first." };
  const { supabase, row } = connection;
  if (!row.scopes.split(" ").includes(GMAIL_MODIFY)) {
    return { ok: false, reason: "reconnect", message: "Reconnect Gmail to allow deleting emails." };
  }
  try {
    await withGmail(connection, (token) => trashMessage(token, messageId));
  } catch (error) {
    if (error instanceof GmailScopeError || error instanceof ConnectionExpiredError) {
      return { ok: false, reason: "reconnect", message: "Reconnect Gmail to allow deleting emails." };
    }
    console.error("Moving email to Trash failed", error);
    return { ok: false, reason: "error", message: "Couldn’t delete the email. Try again." };
  }
  // Also hidden here, in case it's taken back out of Trash later.
  const { error } = await supabase.from("docket_items").upsert({
    staff_id: row.staff_id,
    gmail_message_id: messageId,
    gmail_thread_id: threadId,
    skipped_at: new Date().toISOString(),
  });
  if (error) console.error("Deleted in Gmail but not recorded", error.message);
  return { ok: true };
}

// --- Search ---------------------------------------------------------------------

type SearchRow = ItemRow & { subject: string | null };

// This coach's Info cards already read by Briefcase (in the feed or not:
// skipped, replied to, shortlisted, shared) matching a name, sender or
// subject. Only their own Docket, as everywhere else.
export async function searchDocketCards(q: string): Promise<SearchResult[]> {
  const term = cleanSearch(q);
  if (term.length < 2) return [];
  const connection = await loadConnection();
  if (!connection) return [];
  const { supabase, row } = connection;
  const pattern = `"*${term}*"`;
  const { data, error } = await supabase
    .from("docket_items")
    .select(`${ITEM_COLUMNS}, subject`)
    .eq("staff_id", row.staff_id)
    .not("extraction", "is", null)
    .or(`extraction->name->>value.ilike.${pattern},sender_name.ilike.${pattern},subject.ilike.${pattern}`)
    .order("email_date", { ascending: false, nullsFirst: false })
    .limit(25)
    .returns<SearchRow[]>();
  if (error) {
    console.error("Docket search failed", error.message);
    return [];
  }
  // Not recruiting emails (newsletters and the like) aren't player cards.
  const rows = (data ?? []).filter((r) => isCurrentInfo(r.extraction) && r.extraction.recruiting !== "no").slice(0, 20);
  const flags = await listFlags(supabase, row.staff_id, rows.map((r) => r.gmail_message_id));
  return rows.map((r) => ({
    id: r.gmail_message_id,
    info: r.extraction,
    from: r.sender_name,
    subject: r.subject,
    date: r.email_date,
    status: cardStatus(r, r.email_date),
    shortlisted: flags.shortlisted.has(r.gmail_message_id),
    shared: flags.shared.has(r.gmail_message_id),
  }));
}

export const GMAIL_SEARCH_LIMIT = 5;

// Searches the whole mailbox (not just the Docket's 30 days) for emails with
// film links mentioning the name. Emails the AI hasn't read come back with
// info null; read them with extractInfoCards. Found emails are saved to the
// Docket, so searching again finds them straight away.
export async function searchGmailCards(q: string): Promise<GmailSearchResult> {
  const term = cleanSearch(q);
  if (term.length < 2) return { status: "ok", results: [] };
  const connection = await loadConnection();
  if (!connection) return { status: "expired" };
  const { supabase, row } = connection;
  try {
    const found = await withGmail(connection, async (token) => {
      const ids = await listMessageIds(token, `"${term}" ${LINK_SITES}`, 15);
      return inBatches(ids, 10, (id) => getMessage(token, id));
    });
    const messages = found
      .filter((m) => extractLinks(bodyText(m.payload)).length > 0)
      .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))
      .slice(0, GMAIL_SEARCH_LIMIT);
    const ids = messages.map((m) => m.id);
    const { data: items } = ids.length
      ? await supabase.from("docket_items").select(ITEM_COLUMNS).in("gmail_message_id", ids).returns<ItemRow[]>()
      : { data: [] };
    const byId = new Map((items ?? []).map((i) => [i.gmail_message_id, i]));
    await saveDetails(supabase, row.staff_id, messages.filter((m) => !byId.get(m.id)?.sender_name));
    const flags = await listFlags(supabase, row.staff_id, ids);
    return {
      status: "ok",
      results: messages.map((m) => {
        const item = byId.get(m.id);
        const { from, subject, date } = describe(m);
        return {
          id: m.id,
          info: isCurrentInfo(item?.extraction) ? item.extraction : null,
          from,
          subject,
          date,
          status: cardStatus(item, date),
          shortlisted: flags.shortlisted.has(m.id),
          shared: flags.shared.has(m.id),
        };
      }),
    };
  } catch (error) {
    if (error instanceof ConnectionExpiredError) return { status: "expired" };
    console.error("Gmail search failed", error);
    return { status: "error", message: "Couldn't search Gmail right now. Try again in a moment." };
  }
}

// One card on its own (opened from search): the email, its Info card, and
// where it stands in the Docket.
export async function loadDocketCard(messageId: string): Promise<CardResult> {
  if (!/^[\w-]{1,64}$/.test(messageId)) return { status: "not_found" };
  const connection = await loadConnection();
  if (!connection) return { status: "not_connected" };
  const { supabase, row } = connection;
  try {
    const message = await withGmail(connection, (token) => getMessage(token, messageId));
    const { data: item } = await supabase
      .from("docket_items")
      .select(ITEM_COLUMNS)
      .eq("gmail_message_id", messageId)
      .maybeSingle<ItemRow>();
    if (!item?.sender_name) await saveDetails(supabase, row.staff_id, [message]);
    const flags = await listFlags(supabase, row.staff_id, [messageId]);
    const email: DocketEmail = {
      id: message.id,
      threadId: message.threadId,
      ...describe(message),
      links: extractLinks(bodyText(message.payload)),
      info: isCurrentInfo(item?.extraction) ? item.extraction : null,
      replied: item?.replied_at && item.reply_template ? { template: item.reply_template, at: item.replied_at } : null,
      shortlisted: flags.shortlisted.has(messageId),
      shared: flags.shared.has(messageId),
    };
    return {
      status: "ok",
      email,
      card: cardStatus(item ?? undefined, email.date),
      inTrash: (message.labelIds ?? []).includes("TRASH"),
      canSend: row.scopes.split(" ").includes(GMAIL_SEND),
      canDelete: row.scopes.split(" ").includes(GMAIL_MODIFY),
    };
  } catch (error) {
    if (error instanceof GmailNotFoundError) return { status: "not_found" };
    if (error instanceof ConnectionExpiredError) return { status: "expired" };
    console.error("Loading Docket card failed", error);
    return { status: "error", message: "Couldn't read that email right now. Try again in a moment." };
  }
}
