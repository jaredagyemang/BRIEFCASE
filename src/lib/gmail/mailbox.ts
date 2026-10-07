import "server-only";
import { header, parseAddress, type Connection, type ConnectionRow } from "./connection";
import {
  GMAIL_MODIFY,
  GMAIL_SEND,
  getMessage,
  listMessageIds,
  sendMessage,
  trashMessage,
  type GmailMessage,
} from "./google";
import {
  getOutlookMessage,
  listOutlookJunk,
  listOutlookRecent,
  outlookCanRead,
  outlookCanSend,
  replyOutlook,
  searchOutlook,
  trashOutlook,
} from "./outlook";

// The Docket's mailbox operations, for Gmail or Outlook, whichever the coach
// connected. Gmail's behaviour is unchanged; Outlook messages come back in
// Gmail's shape (see outlook.ts), so everything else reads both the same way.

const outlook = (c: Connection) => c.row.provider === "microsoft";

// Gmail search narrows the emails down; each one is then read to pull out the
// actual links (search matches loosely, e.g. a mention of "youtube.com").
const LINK_SITES = "{youtube.com youtu.be hudl.com veo.co docs.google.com}";

// Recent emails mentioning the film sites (not Spam/Junk or Trash/Deleted Items).
export function listRecent(c: Connection, token: string, days: number, max: number) {
  return outlook(c)
    ? listOutlookRecent(token, days, max)
    : listMessageIds(token, `newer_than:${days}d ${LINK_SITES}`, max);
}

// "Also check Spam": Gmail's Spam, or Outlook's Junk Email folder.
export function listSpam(c: Connection, token: string, days: number, max: number) {
  return outlook(c)
    ? listOutlookJunk(token, days, max)
    : listMessageIds(token, `in:spam newer_than:${days}d ${LINK_SITES}`, max, true);
}

// Docket search's mailbox search for a name (any date).
export function searchMailbox(c: Connection, token: string, term: string, max: number) {
  return outlook(c) ? searchOutlook(token, term, max) : listMessageIds(token, `"${term}" ${LINK_SITES}`, max);
}

export function fetchMessage(c: Connection, token: string, id: string): Promise<GmailMessage> {
  return outlook(c) ? getOutlookMessage(token, id) : getMessage(token, id);
}

// Moves an email to Gmail's Trash or Outlook's Deleted Items.
export async function trash(c: Connection, token: string, id: string) {
  if (outlook(c)) await trashOutlook(token, id);
  else await trashMessage(token, id);
}

// Sends a reply in the same conversation, from the coach's own account.
// Gmail takes a ready-made message (raw); Outlook builds its own.
export async function reply(c: Connection, token: string, original: GmailMessage, body: string, raw: () => string) {
  if (!outlook(c)) {
    await sendMessage(token, raw(), original.threadId);
    return;
  }
  const to = parseAddress(header(original.payload, "Reply-To") || header(original.payload, "From"));
  if (!to.email) throw new Error("The email has no address to reply to.");
  await replyOutlook(token, original, { name: to.name, email: to.email }, body);
}

// What this connection is allowed to do.
export const canSendMail = (row: ConnectionRow) =>
  row.provider === "microsoft" ? outlookCanSend(row.scopes) : row.scopes.split(" ").includes(GMAIL_SEND);
// Outlook's mail permission covers moving to Deleted Items.
export const canDeleteMail = (row: ConnectionRow) =>
  row.provider === "microsoft" ? outlookCanRead(row.scopes) : row.scopes.split(" ").includes(GMAIL_MODIFY);

// Message ids: Gmail's are short hex; Outlook's are long base64url (with "=").
export const validMessageId = (id: string) => /^[\w=-]{1,512}$/.test(id);
