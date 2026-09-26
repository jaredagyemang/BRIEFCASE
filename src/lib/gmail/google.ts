import "server-only";

// Google OAuth and Gmail API calls. Docs:
// https://developers.google.com/identity/protocols/oauth2/web-server
// https://developers.google.com/gmail/api/reference/rest
//
// The *_URL environment variables are only for testing against a stand-in
// server; in normal use they're unset and the real Google endpoints are used.
const AUTH_URL = process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const REVOKE_URL = process.env.GOOGLE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke";
const GMAIL_URL = process.env.GMAIL_API_URL ?? "https://gmail.googleapis.com/gmail/v1";

// Holds the one-time value that protects the sign-in round trip.
export const STATE_COOKIE = "gmail_oauth_state";

export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
// Sending replies from the Info card (send only: it can't read, change or
// delete anything by itself).
export const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
// Moving an email to Gmail's Trash from the Info card ("Delete"). Gmail
// empties Trash after 30 days. (Deleting outright would need full access to
// the whole mailbox, which Briefcase doesn't ask for.)
export const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
// Read-only Gmail, sending replies, moving emails to Trash, and the address
// of the account.
const SCOPES = ["openid", "email", GMAIL_READONLY, GMAIL_SEND, GMAIL_MODIFY];

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Gmail isn't set up: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing.");
  }
  return { clientId, clientSecret };
}

// Must match a redirect URI registered in Google Cloud Console exactly.
export function redirectUri(origin: string) {
  return `${origin}/api/auth/gmail/callback`;
}

export function authorizationUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: credentials().clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    // A refresh token, so the app can keep reading without asking again.
    access_type: "offline",
    // Always show the consent screen, which is what guarantees a refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export class GoogleAuthError extends Error {
  // "invalid_grant": the refresh token no longer works (expired or revoked).
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Google token request failed", res.status, json.error, json.error_description);
    throw new GoogleAuthError(json.error_description ?? "Google sign-in failed.", json.error);
  }
  return json as TokenResponse;
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({ code, redirect_uri: redirectUri(origin), grant_type: "authorization_code" });
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

// Tells Google to cancel the app's access. Best effort: the connection is
// deleted on our side either way.
export async function revokeToken(token: string) {
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("Google token revoke failed", res.status, await res.text().catch(() => ""));
  } catch (error) {
    console.error("Google token revoke failed", error);
  }
}

// The email address in the ID token Google returned with the tokens. It came
// straight from Google's token endpoint over HTTPS, so it isn't re-verified.
export function emailFromIdToken(idToken: string | undefined) {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

// --- Gmail -------------------------------------------------------------------

export class GmailUnauthorizedError extends Error {}
// The connection doesn't include a permission this needs (e.g. sending).
export class GmailScopeError extends Error {}

async function gmail<T>(path: string, accessToken: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GMAIL_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) throw new GmailUnauthorizedError("Gmail rejected the access token.");
  if (res.status === 403 && /insufficient|scope|permission/i.test(await res.clone().text().catch(() => ""))) {
    throw new GmailScopeError("This Gmail connection can't do that. Reconnect Gmail.");
  }
  if (!res.ok) {
    console.error("Gmail request failed", path.split("?")[0], res.status, await res.text().catch(() => ""));
    throw new Error("Couldn't read Gmail right now. Try again in a moment.");
  }
  return res.json() as Promise<T>;
}

export type GmailPart = {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
export type GmailMessage = { id: string; threadId: string; internalDate?: string; snippet?: string; payload?: GmailPart };

export async function listMessageIds(accessToken: string, query: string, max: number) {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const json = await gmail<{ messages?: { id: string }[] }>(`/users/me/messages?${params}`, accessToken);
  return (json.messages ?? []).map((m) => m.id);
}

export function getMessage(accessToken: string, id: string) {
  return gmail<GmailMessage>(`/users/me/messages/${encodeURIComponent(id)}?format=full`, accessToken);
}

// Sends a raw RFC 2822 message (base64url), as a reply in the given thread.
export function sendMessage(accessToken: string, raw: string, threadId: string) {
  return gmail<{ id: string; threadId: string }>("/users/me/messages/send", accessToken, { raw, threadId });
}

// Moves a message to Trash (Gmail deletes it for good after 30 days).
export function trashMessage(accessToken: string, id: string) {
  return gmail<{ id: string }>(`/users/me/messages/${encodeURIComponent(id)}/trash`, accessToken, {});
}
