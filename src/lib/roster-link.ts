import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

// Fetches a roster page a coach pasted a link to (a team website, a Google
// Doc or Sheet) and turns it into plain text for Claude to read.
//
// The server makes the request, so it only goes to public internet
// addresses: never to this server itself or a private network (checked on
// every redirect, at connect time).

export class RosterLinkError extends Error {}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
// About 25k tokens: far more than any roster needs.
const MAX_TEXT_CHARS = 100_000;
// Less readable text than this means there's nothing to read (the page is
// built by JavaScript in the browser, or it's empty).
const MIN_TEXT_CHARS = 80;

// For local testing only: lets links to this machine through.
const allowLocal = () => process.env.ROSTER_LINK_ALLOW_LOCAL === "true";

export type RosterPage = { url: string; title: string | null; text: string };

// "example.com/roster" → "https://example.com/roster". Returns null for
// anything that isn't a web link.
export function parseRosterUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  // (A colon followed by digits is a port, as in "example.com:8080/roster".)
  const withScheme = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && !net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && !allowLocal()) return null;
    return url;
  } catch {
    return null;
  }
}

// Google Docs and Sheets links open an editor that needs JavaScript; their
// export links return the content itself (plain text / CSV).
export function exportUrlFor(url: URL): URL {
  if (url.hostname !== "docs.google.com") return url;
  const doc = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
  if (doc) return new URL(`https://docs.google.com/document/d/${doc[1]}/export?format=txt`);
  const sheet = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
  if (sheet) {
    const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1];
    return new URL(
      `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`,
    );
  }
  return url;
}

const isGoogleDoc = (url: URL) => url.hostname === "docs.google.com";

export async function fetchRosterPage(input: string): Promise<RosterPage> {
  const original = parseRosterUrl(input);
  if (!original) {
    throw new RosterLinkError("That doesn’t look like a web link. Copy the full address (starting with https://).");
  }
  const google = isGoogleDoc(original);
  const notShared = new RosterLinkError(
    "That Google Doc isn’t shared publicly, so Briefcase can’t open it. In Google Docs, tap Share, set General access to “Anyone with the link”, then try again.",
  );
  const needsLogin = new RosterLinkError(
    "That page needs a login, so Briefcase can’t read it. Try a public link to the roster, or take a photo or screenshot of it and use Scan roster.",
  );

  let url = exportUrlFor(original);
  let response: Fetched | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await get(url);
    const location = response.status >= 300 && response.status < 400 ? response.headers.location : undefined;
    if (!location) break;
    const next = new URL(location, url);
    if (next.protocol !== "http:" && next.protocol !== "https:") throw brokenLink();
    url = next;
    // Sent to a sign-in page instead of the content.
    if (looksLikeSignIn(url)) throw google ? notShared : needsLogin;
    if (hop === MAX_REDIRECTS) {
      throw new RosterLinkError("That link redirects too many times. Open it in your browser and copy the final address.");
    }
  }
  if (!response) throw brokenLink();

  const { status } = response;
  if (status === 401 || status === 403 || status === 407) throw google ? notShared : needsLogin;
  if (status === 404 || status === 410) {
    throw new RosterLinkError(
      google
        ? "Couldn’t find that Google Doc. Check the link, and that it’s shared with “Anyone with the link”."
        : "That page wasn’t found (it may have moved or been removed). Check the link and try again.",
    );
  }
  if (status === 429) throw new RosterLinkError("That website is limiting requests right now. Try again in a minute.");
  if (status >= 500) throw new RosterLinkError("That website had a problem loading the page. Try again later.");
  if (status < 200 || status >= 300) {
    throw new RosterLinkError(`That website wouldn’t send the page (error ${status}). Check the link and try again.`);
  }

  const type = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type === "application/pdf") {
    throw new RosterLinkError(
      "That link is a PDF, which Briefcase can’t read from a link yet. Take a screenshot of the roster and use Scan roster.",
    );
  }
  if (type.startsWith("image/")) {
    throw new RosterLinkError("That link is a picture. Save it to your photos, then use Scan roster → Choose from photos.");
  }
  const html = type === "text/html" || type === "application/xhtml+xml" || (!type && /^\s*</.test(response.body.subarray(0, 200).toString()));
  const textual = html || type.startsWith("text/") || type === "application/json";
  if (!textual) {
    throw new RosterLinkError(
      "That link is a file Briefcase can’t read. Use a link to a web page, Google Doc or Google Sheet.",
    );
  }

  const raw = decode(response.body, response.headers["content-type"]);
  const title = html ? pageTitle(raw) : null;
  let text = html ? htmlToText(raw) : raw.replace(/\r\n?/g, "\n").trim();

  // A page asking for a password, with little else on it.
  if (html && /<input[^>]+type\s*=\s*["']?password/i.test(raw) && text.length < 3000) throw needsLogin;
  if (text.length < MIN_TEXT_CHARS) {
    throw new RosterLinkError(
      google
        ? "That Google Doc looks empty. Check it’s the right link."
        : "Couldn’t find any text on that page. Some team sites only show the roster in the browser (or after signing in). Take a screenshot of the roster and use Scan roster instead.",
    );
  }
  if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);
  return { url: original.href, title, text };
}

const brokenLink = () =>
  new RosterLinkError("Couldn’t open that link. Check it’s copied correctly and try again.");

function looksLikeSignIn(url: URL) {
  if (url.hostname === "accounts.google.com" || url.hostname === "login.microsoftonline.com") return true;
  return /(^|\/)(log-?in|sign-?in|sign_in|signon|sso|auth|session\/new)(\/|$|\.)/i.test(url.pathname);
}

// ---- Requests

type Fetched = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function get(url: URL): Promise<Fetched> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !allowed(host)) return Promise.reject(privateAddress());

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BriefcaseRosterReader/1.0;)",
          Accept: "text/html,application/xhtml+xml,text/plain,text/csv;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // Redirects and errors: the body isn't needed.
        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
          return;
        }
        const encoding = (res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip" || encoding === "x-gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          if (size > MAX_BYTES) return;
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy();
            reject(new RosterLinkError("That page is too large to read. Try a link to just the roster."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", () => reject(brokenLink()));
      },
    );
    const deadline = setTimeout(() => request.destroy(new Error("timeout")), TIMEOUT_MS);
    request.on("close", () => clearTimeout(deadline));
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof RosterLinkError) return reject(error);
      if (error.message === "timeout" || error.code === "ETIMEDOUT") {
        return reject(new RosterLinkError("That website took too long to respond. Try again, or check the link."));
      }
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        return reject(new RosterLinkError("Couldn’t find that website. Check the link for typos."));
      }
      if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
        return reject(new RosterLinkError("That website isn’t responding. Check the link, or try again later."));
      }
      if (error.code?.startsWith("ERR_TLS") || error.code?.includes("CERT")) {
        return reject(new RosterLinkError("That website’s security certificate isn’t valid, so it wasn’t opened."));
      }
      reject(brokenLink());
    });
  });
}

const privateAddress = () =>
  new RosterLinkError("That link points to a private network address, which Briefcase can’t open.");

// DNS lookup that refuses private, loopback and link-local addresses, so a
// public-looking name can't lead the server into a private network.
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    const done = callback as (...args: unknown[]) => void;
    if (error) return done(error);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !allowed(a.address))) return done(privateAddress());
    if (options.all) return done(null, list);
    done(null, list[0].address, list[0].family);
  });
};

function allowed(ip: string) {
  return allowLocal() || isPublicAddress(ip);
}

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, including cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!net.isIPv6(ip)) return false;
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  return !(
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("::ffff:") || // IPv4-mapped in hex form
    v6.startsWith("64:ff9b:") || // IPv4 translation
    /^f[cd]/.test(v6) || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith("ff") // multicast
  );
}

// ---- Page text

function decode(body: Buffer, contentType: string | undefined) {
  const charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1] ?? body.subarray(0, 2000).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function pageTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeEntities(title).replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
}

// HTML → readable text, keeping table rows on their own lines with cells
// separated by " | " (rosters are usually tables).
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|head|iframe|select)\b[\s\S]*?<\/\1>/gi, " ")
      // An email link becomes its address (link text is often just "Email").
      .replace(/<a\s[^>]*href\s*=\s*["']mailto:([^"'?]+)[^>]*>[\s\S]*?<\/a>/gi, " $1 ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<br\s*\/?>|<\/?(p|div|li|tr|h[1-6]|section|article|header|footer|nav|table|thead|tbody|ul|ol|dl|dt|dd|main|aside|form|fieldset|blockquote|pre)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t ]+/g, " ")
        .replace(/(\s*\|\s*)+$/, "")
        .replace(/^(\s*\|\s*)+/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  szlig: "ß",
  oslash: "ø",
  Oslash: "Ø",
  aelig: "æ",
  AElig: "Æ",
};

// Accented letters in names: "&iacute;" → "í", "&Ntilde;" → "Ñ".
const ACCENTS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  uml: "\u0308",
  circ: "\u0302",
  tilde: "\u0303",
  cedil: "\u0327",
  ring: "\u030a",
  caron: "\u030c",
};

function decodeEntities(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const accent = name.match(/^([a-z])(acute|grave|uml|circ|tilde|cedil|ring|caron)$/i);
    if (accent) return (accent[1] + ACCENTS[accent[2].toLowerCase()]).normalize("NFC");
    return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? match;
  });
}
