import "server-only";
import {
  GmailNotFoundError,
  GmailScopeError,
  GmailUnauthorizedError,
  GoogleAuthError,
  type GmailMessage,
} from "./google";

// Microsoft sign-in and the Microsoft Graph mail API, for coaches whose email
// is Outlook / Microsoft 365. Docs:
// https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
// https://learn.microsoft.com/graph/api/resources/message
//
// Messages are returned in the same shape as Gmail's (see toGmailShape), so
// the rest of The Docket reads both the same way. Errors use the same classes
// as Gmail's for the same reason.
//
// The *_URL environment variables are only for testing against a stand-in
// server; in normal use they're unset and Microsoft's endpoints are used.
const LOGIN_URL = process.env.MICROSOFT_LOGIN_URL ?? "https://login.microsoftonline.com";
const GRAPH_URL = process.env.GRAPH_API_URL ?? "https://graph.microsoft.com/v1.0";
// Work, school and personal Microsoft accounts.
const TENANT = "common";

export const OUTLOOK_STATE_COOKIE = "outlook_oauth_state";
// Why connecting failed, in Microsoft's (or the database's) own words, for
// The Docket to show. A private cookie rather than the address, so nobody can
// put made-up text on the page with a crafted link.
export const OUTLOOK_ERROR_COOKIE = "outlook_connect_error";

// The exact reason behind an error (e.g. "AADSTS7000215: Invalid client
// secret provided."), shown when connecting fails.
export const errorDetail = (error: unknown): string =>
  error && typeof error === "object" && "detail" in error && typeof error.detail === "string"
    ? error.detail
    : error instanceof Error
      ? error.message
      : String(error);

const firstLine = (s: unknown) => (typeof s === "string" ? s.split(/\r?\n/)[0] : "");

// The smallest set that covers reading, replying, and moving mail to Deleted
// Items (Mail.Read can't move anything). offline_access keeps reading without
// signing in again; User.Read gives the coach's address.
const SCOPES = ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];
export const outlookCanRead = (scopes: string) => /(^|[\s/])Mail\.ReadWrite(\s|$)/i.test(scopes);
export const outlookCanSend = (scopes: string) => /(^|[\s/])Mail\.Send(\s|$)/i.test(scopes);

function credentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const missing = [!clientId && "MICROSOFT_CLIENT_ID", !clientSecret && "MICROSOFT_CLIENT_SECRET"].filter(Boolean);
  if (missing.length) throw new Error(`Outlook isn't set up: ${missing.join(" and ")} missing on the server.`);
  return { clientId: clientId!, clientSecret: clientSecret! };
}

// Must match a redirect URI registered in Entra (Authentication → Web).
export function outlookRedirectUri(origin: string) {
  return `${origin}/api/auth/outlook/callback`;
}

export function outlookAuthorizationUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: credentials().clientId,
    response_type: "code",
    redirect_uri: outlookRedirectUri(origin),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    // Lets a coach with more than one Microsoft account pick the right one.
    prompt: "select_account",
  });
  return `${LOGIN_URL}/${TENANT}/oauth2/v2.0/authorize?${params}`;
}

// A link an IT administrator can open to approve Briefcase for their whole
// school (when the school only lets admins approve apps that read mail).
export function adminConsentUrl(origin: string) {
  const params = new URLSearchParams({
    client_id: credentials().clientId,
    scope: SCOPES.filter((s) => s !== "offline_access")
      .map((s) => `https://graph.microsoft.com/${s}`)
      .join(" "),
    redirect_uri: outlookRedirectUri(origin),
  });
  return `${LOGIN_URL}/organizations/v2.0/adminconsent?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${LOGIN_URL}/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Microsoft token request failed", res.status, json.error, json.error_codes, firstLine(json.error_description));
    // Expired, revoked, or the school now requires something the saved
    // connection can't do (e.g. sign in again): treated as "reconnect".
    const gone = json.error === "invalid_grant" || json.error === "interaction_required";
    const error = new GoogleAuthError(json.error_description ?? "Microsoft sign-in failed.", gone ? "invalid_grant" : json.error);
    throw Object.assign(error, {
      detail: `Microsoft token request failed (HTTP ${res.status}): ${json.error ?? "unknown error"}${
        json.error_description ? ` — ${firstLine(json.error_description)}` : ""
      }`,
    });
  }
  return json as TokenResponse;
}

export function exchangeOutlookCode(code: string, origin: string) {
  return tokenRequest({
    code,
    redirect_uri: outlookRedirectUri(origin),
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });
}

// Microsoft replaces the refresh token each time it's used: save the new one.
export function refreshOutlookToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token", scope: SCOPES.join(" ") });
}

// --- Graph ---------------------------------------------------------------------------

async function graph<T>(path: string, accessToken: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Ids that stay the same when a message is moved (e.g. filed into a
      // folder, or to Deleted Items), since The Docket keeps them.
      Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"',
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Graph's own reason, e.g. "ErrorAccessDenied: Access is denied."
    const text = await res.text().catch(() => "");
    let reason = text.slice(0, 300);
    try {
      const e = JSON.parse(text).error;
      if (e?.code) reason = `${e.code}${e.message ? `: ${e.message}` : ""}`;
    } catch {}
    const detail = `Microsoft Graph ${path.split("?")[0]} failed (HTTP ${res.status})${reason ? `: ${reason}` : ""}`;
    const withDetail = <E extends Error>(error: E) => Object.assign(error, { detail });
    if (res.status === 401) throw withDetail(new GmailUnauthorizedError("Outlook rejected the access token."));
    if (res.status === 403)
      throw withDetail(new GmailScopeError("This Outlook connection can't do that. Reconnect Outlook."));
    if (res.status === 404) throw withDetail(new GmailNotFoundError("That email is no longer in Outlook."));
    console.error(detail);
    throw withDetail(new Error("Couldn't read Outlook right now. Try again in a moment."));
  }
  if (res.status === 202 || res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function outlookAddress(accessToken: string) {
  const me = await graph<{ mail?: string | null; userPrincipalName?: string }>(
    "/me?$select=mail,userPrincipalName",
    accessToken,
  );
  return me.mail || me.userPrincipalName || null;
}

// Junk Email and Deleted Items, by id (to leave them out, or label messages).
type Folders = { junk: string; deleted: string };
const folderCache = new Map<string, { at: number; folders: Folders }>();
async function folders(accessToken: string): Promise<Folders> {
  const hit = folderCache.get(accessToken);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.folders;
  const [junk, deleted] = await Promise.all([
    graph<{ id: string }>("/me/mailFolders/junkemail?$select=id", accessToken),
    graph<{ id: string }>("/me/mailFolders/deleteditems?$select=id", accessToken),
  ]);
  const value = { junk: junk.id, deleted: deleted.id };
  if (folderCache.size > 500) folderCache.clear();
  folderCache.set(accessToken, { at: Date.now(), folders: value });
  return value;
}

// Outlook's search (KQL), narrowed to emails mentioning the film sites; each
// email is then read to find the actual links, as with Gmail.
const SITES = "(youtube.com OR youtu.be OR hudl.com OR veo.co OR docs.google.com OR sportsrecruits.com)";
const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const kqlQuote = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;

async function searchIds(accessToken: string, path: string, kql: string, max: number, skip: string[]) {
  const params = new URLSearchParams({
    $search: `"${kql.replace(/"/g, '\\"')}"`,
    $top: String(max),
    $select: "id,parentFolderId",
  });
  const json = await graph<{ value?: { id: string; parentFolderId?: string }[] }>(`${path}?${params}`, accessToken);
  return (json.value ?? []).filter((m) => !skip.includes(m.parentFolderId ?? "")).map((m) => m.id);
}

// The Docket's emails: the whole mailbox except Junk and Deleted Items.
export async function listOutlookRecent(accessToken: string, days: number, max: number) {
  const f = await folders(accessToken);
  return searchIds(accessToken, "/me/messages", `received>=${since(days)} AND ${SITES}`, max, [f.junk, f.deleted]);
}

// "Also check Spam": the Junk Email folder.
export function listOutlookJunk(accessToken: string, days: number, max: number) {
  return searchIds(accessToken, "/me/mailFolders/junkemail/messages", `received>=${since(days)} AND ${SITES}`, max, []);
}

// Docket search's mailbox search: any date, except Junk and Deleted Items.
export async function searchOutlook(accessToken: string, term: string, max: number) {
  const f = await folders(accessToken);
  return searchIds(accessToken, "/me/messages", `${kqlQuote(term)} AND ${SITES}`, max, [f.junk, f.deleted]);
}

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string;
  conversationId?: string;
  receivedDateTime?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphAddress;
  replyTo?: GraphAddress[];
  internetMessageId?: string;
  parentFolderId?: string;
  body?: { contentType?: string; content?: string };
};

const address = (a: GraphAddress | undefined) => {
  const email = a?.emailAddress?.address ?? "";
  const name = (a?.emailAddress?.name ?? "").replace(/["\r\n]/g, " ").trim();
  return email ? (name && name !== email ? `"${name}" <${email}>` : email) : name;
};

// An Outlook message in Gmail's shape: headers, one body part, a date, and
// the SPAM / TRASH labels for Junk Email and Deleted Items.
function toGmailShape(m: GraphMessage, f: Folders): GmailMessage {
  const html = (m.body?.contentType ?? "").toLowerCase() === "html";
  const headers = [
    { name: "From", value: address(m.from) },
    { name: "Subject", value: m.subject ?? "" },
    ...(m.replyTo?.length ? [{ name: "Reply-To", value: address(m.replyTo[0]) }] : []),
    ...(m.internetMessageId ? [{ name: "Message-ID", value: m.internetMessageId }] : []),
  ];
  return {
    id: m.id,
    threadId: m.conversationId ?? m.id,
    internalDate: m.receivedDateTime ? String(Date.parse(m.receivedDateTime)) : undefined,
    snippet: m.bodyPreview,
    labelIds: [m.parentFolderId === f.junk ? "SPAM" : m.parentFolderId === f.deleted ? "TRASH" : "INBOX"],
    payload: {
      mimeType: html ? "text/html" : "text/plain",
      headers,
      body: { data: Buffer.from(m.body?.content ?? "", "utf8").toString("base64url") },
    },
  };
}

export async function getOutlookMessage(accessToken: string, id: string) {
  const select =
    "id,conversationId,receivedDateTime,subject,bodyPreview,from,replyTo,internetMessageId,parentFolderId,body";
  const [m, f] = await Promise.all([
    graph<GraphMessage>(`/me/messages/${encodeURIComponent(id)}?$select=${select}`, accessToken),
    folders(accessToken),
  ]);
  return toGmailShape(m, f);
}

// Replies in the same conversation, from the coach's own account (it appears
// in their Sent Items). Sent to the Reply-To address when there is one, as
// with Gmail.
export async function replyOutlook(
  accessToken: string,
  original: GmailMessage,
  to: { name: string; email: string },
  body: string,
) {
  await graph(`/me/messages/${encodeURIComponent(original.id)}/reply`, accessToken, {
    message: {
      toRecipients: [{ emailAddress: { address: to.email, ...(to.name ? { name: to.name } : {}) } }],
      body: { contentType: "Text", content: body },
    },
  });
}

// Moves a message to Deleted Items.
export async function trashOutlook(accessToken: string, id: string) {
  await graph(`/me/messages/${encodeURIComponent(id)}/move`, accessToken, { destinationId: "deleteditems" });
}
