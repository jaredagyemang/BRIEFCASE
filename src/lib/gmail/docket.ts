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
  isCurrentInfo,
  type DocketEmail,
  type DocketInfo,
  type DocketResult,
  type ReplyTemplate,
} from "./docket-types";
import { EXTRACTION_MODEL, extractInfo } from "./extract";
import {
  GMAIL_MODIFY,
  GMAIL_SEND,
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
const SEARCH = `newer_than:${LOOKBACK_DAYS}d {youtube.com youtu.be hudl.com veo.co docs.google.com}`;

type ItemRow = {
  gmail_message_id: string;
  extraction: DocketInfo | null;
  skipped_at: string | null;
  replied_at: string | null;
  reply_template: ReplyTemplate | null;
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
    const [{ data: items }, { data: shortlisted }] = await Promise.all([
      supabase
        .from("docket_items")
        .select("gmail_message_id, extraction, skipped_at, replied_at, reply_template")
        .in("gmail_message_id", ids)
        .returns<ItemRow[]>(),
      supabase
        .from("shortlist")
        .select("gmail_message_id")
        .eq("source_staff_id", row.staff_id)
        .in("gmail_message_id", ids)
        .returns<{ gmail_message_id: string }[]>(),
    ]);
    const byId = new Map((items ?? []).map((i) => [i.gmail_message_id, i]));
    const onShortlist = new Set((shortlisted ?? []).map((s) => s.gmail_message_id));

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

// --- Shortlist (shared by all staff) -----------------------------------------------

export async function setShortlisted(messageId: string, shortlisted: boolean) {
  const connection = await loadConnection();
  if (!connection) throw new Error("Gmail isn't connected.");
  const { supabase, row } = connection;

  if (!shortlisted) {
    const { error } = await supabase
      .from("shortlist")
      .delete()
      .eq("source_staff_id", row.staff_id)
      .eq("gmail_message_id", messageId);
    if (error) throw new Error(`Couldn't update the Shortlist: ${error.message}`);
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
  const { error } = await supabase.from("shortlist").upsert(
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
    },
    { onConflict: "source_staff_id,gmail_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Couldn't update the Shortlist: ${error.message}`);
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
