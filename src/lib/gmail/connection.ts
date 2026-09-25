import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "./crypto";
import {
  GMAIL_READONLY,
  GmailUnauthorizedError,
  GoogleAuthError,
  getMessage,
  listMessageIds,
  refreshAccessToken,
  revokeToken,
  type GmailPart,
} from "./google";
import { extractLinks, type FoundLink } from "./links";

// A coach's Gmail connection (one row in gmail_connections, readable only by
// them). Tokens are decrypted only here, on the server, when needed.

type ConnectionRow = {
  staff_id: string;
  google_email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string;
  connected_at: string;
};

async function signedInUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) throw new Error("Not signed in");
  return id as string;
}

export async function getConnectionSummary() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gmail_connections")
    .select("google_email, connected_at")
    .maybeSingle<{ google_email: string; connected_at: string }>();
  return data;
}

export async function saveConnection(tokens: {
  googleEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scopes: string;
}) {
  const supabase = await createClient();
  const staffId = await signedInUserId(supabase);
  const { error } = await supabase.from("gmail_connections").upsert({
    staff_id: staffId,
    google_email: tokens.googleEmail,
    refresh_token: encryptToken(tokens.refreshToken),
    access_token: encryptToken(tokens.accessToken),
    access_token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    scopes: tokens.scopes,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Couldn't save the Gmail connection: ${error.message}`);
}

// Cancels the app's access at Google and deletes the connection.
export async function disconnect() {
  const supabase = await createClient();
  const staffId = await signedInUserId(supabase);
  const { data: row } = await supabase
    .from("gmail_connections")
    .select("refresh_token")
    .eq("staff_id", staffId)
    .maybeSingle<Pick<ConnectionRow, "refresh_token">>();
  if (row) {
    try {
      await revokeToken(decryptToken(row.refresh_token));
    } catch (error) {
      console.error("Couldn't revoke Gmail token", error);
    }
  }
  const { error } = await supabase.from("gmail_connections").delete().eq("staff_id", staffId);
  if (error) throw new Error(`Couldn't disconnect Gmail: ${error.message}`);
}

// A working access token, refreshed (and saved) when the stored one is about
// to expire. Throws GoogleAuthError("invalid_grant") when the connection no
// longer works, e.g. it was revoked or expired after 7 days in Testing mode.
async function accessToken(row: ConnectionRow, force = false) {
  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (!force && row.access_token && expiresAt - Date.now() > 60_000) return decryptToken(row.access_token);

  const fresh = await refreshAccessToken(decryptToken(row.refresh_token));
  const supabase = await createClient();
  await supabase
    .from("gmail_connections")
    .update({
      access_token: encryptToken(fresh.access_token),
      access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      // Google may rotate the refresh token.
      ...(fresh.refresh_token ? { refresh_token: encryptToken(fresh.refresh_token) } : {}),
    })
    .eq("staff_id", row.staff_id);
  return fresh.access_token;
}

// --- Finding links in recent emails -------------------------------------------

export const LOOKBACK_DAYS = 30;
export const MAX_EMAILS = 100;
// Gmail search narrows the emails down; each one is then read to pull out the
// actual links (search matches loosely, e.g. a mention of "youtube.com").
const SEARCH = `newer_than:${LOOKBACK_DAYS}d {youtube.com youtu.be hudl.com veo.co docs.google.com}`;

export type EmailWithLinks = {
  id: string;
  from: string;
  subject: string;
  date: string | null;
  links: FoundLink[];
};

export type GmailLinksResult =
  | { status: "not_connected" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "ok"; googleEmail: string; emails: EmailWithLinks[]; scanned: number };

const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

// All the text and HTML in a message, including nested parts (attachments are
// skipped: their data isn't in the message body).
function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const own =
    part.body?.data && /^text\/(plain|html)/.test(part.mimeType ?? "")
      ? Buffer.from(part.body.data, "base64url").toString("utf8")
      : "";
  return [own, ...(part.parts ?? []).map(bodyText)].join("\n");
}

// "Coach Smith <smith@club.org>" → "Coach Smith"; a bare address stays as is.
function senderName(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? match[1].trim() || match[2] : from.trim();
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return results;
}

export async function findLinksInRecentEmails(): Promise<GmailLinksResult> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("gmail_connections").select("*").maybeSingle<ConnectionRow>();
  if (!row) return { status: "not_connected" };
  if (!row.scopes.split(" ").includes(GMAIL_READONLY)) return { status: "expired" };

  const read = async (token: string) => {
    const ids = await listMessageIds(token, SEARCH, MAX_EMAILS);
    const messages = await inBatches(ids, 10, (id) => getMessage(token, id));
    return messages;
  };

  try {
    let messages;
    try {
      messages = await read(await accessToken(row));
    } catch (error) {
      // The stored access token was rejected (e.g. revoked early): refresh once.
      if (!(error instanceof GmailUnauthorizedError)) throw error;
      messages = await read(await accessToken(row, true));
    }
    const emails = messages
      .map((m): EmailWithLinks => ({
        id: m.id,
        from: senderName(header(m.payload, "From")) || "Unknown sender",
        subject: header(m.payload, "Subject") || "(no subject)",
        date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
        links: extractLinks(bodyText(m.payload)),
      }))
      .filter((e) => e.links.length > 0)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { status: "ok", googleEmail: row.google_email, emails, scanned: messages.length };
  } catch (error) {
    if ((error instanceof GoogleAuthError && error.code === "invalid_grant") || error instanceof GmailUnauthorizedError) {
      // The connection no longer works; remove it so the coach can reconnect.
      await supabase.from("gmail_connections").delete().eq("staff_id", row.staff_id);
      return { status: "expired" };
    }
    console.error("Reading Gmail failed", error);
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't read Gmail." };
  }
}
