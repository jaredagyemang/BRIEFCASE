// Finds video (YouTube, Hudl, Veo) and Google Doc links in an email.

export type LinkPlatform = "youtube" | "hudl" | "veo" | "gdoc";

export type FoundLink = { url: string; platform: LinkPlatform };

export const PLATFORM_LABEL: Record<LinkPlatform, string> = {
  youtube: "YouTube",
  hudl: "Hudl",
  veo: "Veo",
  gdoc: "Google Doc",
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
  return null;
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
