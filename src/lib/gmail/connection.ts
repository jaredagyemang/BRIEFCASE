import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "./crypto";
import { GMAIL_READONLY, GmailUnauthorizedError, GoogleAuthError, refreshAccessToken, revokeToken, type GmailPart } from "./google";
import { outlookCanRead, refreshOutlookToken } from "./outlook";

// A coach's email connection, Gmail or Outlook (one row in gmail_connections,
// readable only by them; one mailbox at a time). Tokens are decrypted only
// here, on the server, when needed.

export type { MailProvider } from "@/lib/mail/labels";
import type { MailProvider } from "@/lib/mail/labels";

export type ConnectionRow = {
  staff_id: string;
  provider: MailProvider;
  // The connected address, Gmail or Outlook.
  google_email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string;
  connected_at: string;
};

export async function signedInUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) throw new Error("Not signed in");
  return id as string;
}

export async function getConnectionSummary() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gmail_connections")
    .select("google_email, connected_at, provider")
    .maybeSingle<{ google_email: string; connected_at: string; provider: MailProvider }>();
  return data ? { ...data, provider: data.provider ?? "google" } : null;
}

// Saves a new connection, replacing any earlier one (one mailbox at a time).
// Switching away from Gmail also cancels Briefcase's access at Google.
export async function saveConnection(tokens: {
  provider: MailProvider;
  googleEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scopes: string;
}) {
  const supabase = await createClient();
  const staffId = await signedInUserId(supabase);
  const { data: previous } = await supabase
    .from("gmail_connections")
    .select("provider, refresh_token")
    .eq("staff_id", staffId)
    .maybeSingle<Pick<ConnectionRow, "provider" | "refresh_token">>();
  if (previous && (previous.provider ?? "google") === "google" && tokens.provider !== "google") {
    try {
      await revokeToken(decryptToken(previous.refresh_token));
    } catch (error) {
      console.error("Couldn't revoke the replaced Gmail token", error);
    }
  }
  const { error } = await supabase.from("gmail_connections").upsert({
    staff_id: staffId,
    provider: tokens.provider,
    google_email: tokens.googleEmail,
    refresh_token: encryptToken(tokens.refreshToken),
    access_token: encryptToken(tokens.accessToken),
    access_token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    scopes: tokens.scopes,
    connected_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`Couldn't save the email connection (database${error.code ? ` ${error.code}` : ""}): ${error.message}`);
  }
}

// Deletes the connection. For Gmail, also cancels the app's access at Google
// (Microsoft has no equivalent: coaches remove it in their Microsoft account).
export async function disconnect() {
  const supabase = await createClient();
  const staffId = await signedInUserId(supabase);
  const { data: row } = await supabase
    .from("gmail_connections")
    .select("refresh_token, provider")
    .eq("staff_id", staffId)
    .maybeSingle<Pick<ConnectionRow, "refresh_token" | "provider">>();
  if (row && (row.provider ?? "google") === "google") {
    try {
      await revokeToken(decryptToken(row.refresh_token));
    } catch (error) {
      console.error("Couldn't revoke Gmail token", error);
    }
  }
  const { error } = await supabase.from("gmail_connections").delete().eq("staff_id", staffId);
  if (error) throw new Error(`Couldn't disconnect: ${error.message}`);
}

// A working access token, refreshed (and saved) when the stored one is about
// to expire. Throws GoogleAuthError("invalid_grant") when the connection no
// longer works, e.g. it was revoked or expired after 7 days in Testing mode.
async function accessToken(row: ConnectionRow, force = false) {
  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (!force && row.access_token && expiresAt - Date.now() > 60_000) return decryptToken(row.access_token);

  const fresh =
    row.provider === "microsoft"
      ? await refreshOutlookToken(decryptToken(row.refresh_token))
      : await refreshAccessToken(decryptToken(row.refresh_token));
  const supabase = await createClient();
  await supabase
    .from("gmail_connections")
    .update({
      access_token: encryptToken(fresh.access_token),
      access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      // Google may rotate the refresh token; Microsoft always does.
      ...(fresh.refresh_token ? { refresh_token: encryptToken(fresh.refresh_token) } : {}),
    })
    .eq("staff_id", row.staff_id);
  return fresh.access_token;
}

// --- Using the connection ------------------------------------------------------

export class ConnectionExpiredError extends Error {}

// The signed-in coach's connection, or null if they haven't connected Gmail
// or Outlook.
export async function loadConnection() {
  const supabase = await createClient();
  const { data: row } = await supabase.from("gmail_connections").select("*").maybeSingle<ConnectionRow>();
  if (!row) return null;
  return { supabase, row: { ...row, provider: row.provider ?? "google" } as ConnectionRow };
}

export type Connection = NonNullable<Awaited<ReturnType<typeof loadConnection>>>;

// Can this connection read mail? (Gmail's consent screen lets people untick
// permissions; a connection without read access is treated as expired.)
export const canRead = (row: ConnectionRow) =>
  row.provider === "microsoft" ? outlookCanRead(row.scopes) : row.scopes.split(" ").includes(GMAIL_READONLY);

// Runs fn with a working access token (Gmail or Outlook). If the mailbox
// rejects a stored token, it's refreshed once and fn retried. If the
// connection no longer works at all (revoked, or expired after 7 days in
// Google's Testing mode) it's removed and ConnectionExpiredError thrown, so
// the coach is asked to reconnect.
export async function withMail<T>(connection: Connection, fn: (token: string) => Promise<T>): Promise<T> {
  const { supabase, row } = connection;
  if (!canRead(row)) throw new ConnectionExpiredError();
  try {
    try {
      return await fn(await accessToken(row));
    } catch (error) {
      if (!(error instanceof GmailUnauthorizedError)) throw error;
      return await fn(await accessToken(row, true));
    }
  } catch (error) {
    if ((error instanceof GoogleAuthError && error.code === "invalid_grant") || error instanceof GmailUnauthorizedError) {
      await supabase.from("gmail_connections").delete().eq("staff_id", row.staff_id);
      throw new ConnectionExpiredError();
    }
    throw error;
  }
}

// --- Reading a message -------------------------------------------------------------

export const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

// All the text and HTML in a message, including nested parts (attachments are
// skipped: their data isn't in the message body).
export function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const own =
    part.body?.data && /^text\/(plain|html)/.test(part.mimeType ?? "")
      ? Buffer.from(part.body.data, "base64url").toString("utf8")
      : "";
  return [own, ...(part.parts ?? []).map(bodyText)].join("\n");
}

// Readable text for the AI: the plain-text part when there is one, otherwise
// the HTML with tags removed.
export function readableText(part: GmailPart | undefined): string {
  const parts: { type: string; text: string }[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType ?? "")) {
      parts.push({ type: p.mimeType!, text: Buffer.from(p.body.data, "base64url").toString("utf8") });
    }
    p.parts?.forEach(walk);
  };
  walk(part);
  const plain = parts.filter((p) => p.type.startsWith("text/plain")).map((p) => p.text);
  if (plain.length) return plain.join("\n\n");
  return parts
    .map((p) =>
      p.text
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
        .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, " $1 ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n\n"),
    )
    .join("\n\n")
    .trim();
}

// "Coach Smith <smith@club.org>" → { name: "Coach Smith", email: "smith@club.org" }.
export function parseAddress(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || match[2].trim(), email: match[2].trim() };
  const bare = from.trim();
  return { name: bare, email: /@/.test(bare) ? bare : null };
}
