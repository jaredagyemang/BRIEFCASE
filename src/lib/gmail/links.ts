// Finds video (YouTube, Hudl, Veo), Google Doc and SportsRecruits profile
// links in an email.

export type LinkPlatform = "youtube" | "hudl" | "veo" | "gdoc" | "sportsrecruits";

export type FoundLink = { url: string; platform: LinkPlatform };

export const PLATFORM_LABEL: Record<LinkPlatform, string> = {
  youtube: "YouTube",
  hudl: "Hudl",
  veo: "Veo",
  gdoc: "Google Doc",
  sportsrecruits: "SportsRecruits",
};

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

// Which platform a link belongs to, or null if it's not one we collect. Only
// links to actual videos or documents count, not a site's home page, help
// pages or the unsubscribe links in a notification email's footer.
export function classifyLink(raw: string): FoundLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host === "youtu.be") {
    return path.length > 1 ? { url: url.href, platform: "youtube" } : null;
  }
  if (hostIs(host, "youtube.com")) {
    const video =
      (path === "/watch" && url.searchParams.has("v")) ||
      /^\/(shorts|live|embed)\/[\w-]+/.test(path) ||
      (path === "/playlist" && url.searchParams.has("list"));
    return video ? { url: url.href, platform: "youtube" } : null;
  }
  if (hostIs(host, "hudl.com")) {
    // Videos and highlight reels, e.g. /video/…, /v/…, /profile/…/highlights/…
    return /^\/(video|v|watch|embed|highlights?)\b|\/highlights?\//i.test(path) ? { url: url.href, platform: "hudl" } : null;
  }
  if (hostIs(host, "veo.co")) {
    // Match recordings and shared clips, e.g. app.veo.co/matches/…
    return /^\/(matches|match|clips?|highlights?|shared|embed|videos?)\//i.test(path)
      ? { url: url.href, platform: "veo" }
      : null;
  }
  if (host === "docs.google.com" && path.startsWith("/document/")) {
    return { url: url.href, platform: "gdoc" };
  }
  if (sportsRecruitsUser(url)) {
    // Kept as sent, for the coach's own tap only (see publicLink).
    return { url: url.href, platform: "sportsrecruits" };
  }
  return null;
}

// --- SportsRecruits ------------------------------------------------------------
// A player's SportsRecruits profile, e.g. my.sportsrecruits.com/athlete/<user>.
// Briefcase never loads these pages itself (their terms don't allow
// automated access, and a visit can tell the family a coach looked): the
// coach opens the link with a tap.

// The username in a SportsRecruits profile link, or null.
function sportsRecruitsUser(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!hostIs(url.hostname.toLowerCase(), "sportsrecruits.com")) return null;
  return url.pathname.match(/^\/athlete\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/?(?:[/?#]|$)/)?.[1] ?? null;
}

// The link as it may be saved and shared with other coaches. A SportsRecruits
// link in an email can carry tracking and sign-in data for the coach it was
// sent to, so only the plain public profile address is kept: no query string,
// nothing after the username, no #fragment. Other links are unchanged.
export function publicLink(link: FoundLink): FoundLink {
  if (link.platform !== "sportsrecruits") return link;
  let user: string | null = null;
  try {
    user = sportsRecruitsUser(new URL(link.url));
  } catch {}
  return { platform: "sportsrecruits", url: user ? `https://my.sportsrecruits.com/athlete/${user}` : "https://my.sportsrecruits.com/" };
}

// Links wrapped by Google's click tracking (google.com/url?q=…) are unwrapped
// so the list shows where they really go.
function unwrap(raw: string) {
  try {
    const url = new URL(raw);
    if ((url.hostname === "www.google.com" || url.hostname === "google.com") && url.pathname === "/url") {
      return url.searchParams.get("q") ?? url.searchParams.get("url") ?? raw;
    }
  } catch {}
  return raw;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&#61;/g, "=")
    .replace(/&quot;/g, '"');

// Every matching link in a block of text or HTML, in order, without repeats.
export function extractLinks(text: string): FoundLink[] {
  const found = new Map<string, FoundLink>();
  for (const match of decodeEntities(text).matchAll(/https?:\/\/[^\s"'<>()\[\]{}]+/gi)) {
    const candidate = unwrap(match[0].replace(/[.,;:!?]+$/, ""));
    const link = classifyLink(candidate);
    if (link && !found.has(link.url)) found.set(link.url, link);
  }
  return [...found.values()];
}

// --- Playing links inside the app -------------------------------------------

export type YouTubeVideo = {
  id: string | null;
  embedUrl: string;
  thumbnail: string | null;
  // Shorts are vertical (9:16); everything else is 16:9.
  vertical: boolean;
};

function seconds(t: string | null) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

// The embeddable player for a YouTube link (privacy-enhanced domain, plays
// inline on iPhones, starts muted so it can start by itself), or null.
export function youtubeVideo(raw: string): YouTubeVideo | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  let list: string | null = url.searchParams.get("list");
  let vertical = false;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (hostIs(host, "youtube.com")) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
      if (m) {
        id = m[2];
        vertical = m[1] === "shorts";
      }
    }
  } else return null;
  if (id && !/^[\w-]{6,20}$/.test(id)) id = null;
  if (list && !/^[\w-]+$/.test(list)) list = null;
  if (!id && !list) return null;

  const params = new URLSearchParams({ autoplay: "1", mute: "1", playsinline: "1", rel: "0" });
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
  if (start) params.set("start", String(start));
  if (list) params.set("list", list);
  const path = id ? id : "videoseries";
  return {
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${path}?${params}`,
    thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
    vertical,
  };
}

// Google's read-only preview of a Doc (works when the viewer can open it).
export function googleDocPreview(raw: string) {
  const m = raw.match(/^https?:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)/);
  return m ? `https://docs.google.com/document/d/${m[1]}/preview` : null;
}

// A player's films, with the same YouTube video (e.g. a plain link and a
// timestamped one) or SportsRecruits profile only once.
export function uniqueMedia(links: FoundLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key =
      link.platform === "youtube"
        ? (youtubeVideo(link.url)?.id ?? link.url)
        : link.platform === "sportsrecruits"
          ? publicLink(link).url.toLowerCase()
          : link.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// What the feed swipes through: films and documents. A SportsRecruits profile
// isn't one; it's a button on the Info card instead.
export const swipeMedia = (links: FoundLink[]) => uniqueMedia(links).filter((l) => l.platform !== "sportsrecruits");
export const profileLinks = (links: FoundLink[]) => uniqueMedia(links).filter((l) => l.platform === "sportsrecruits");
