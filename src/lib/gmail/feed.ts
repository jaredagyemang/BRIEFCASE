import type { EmailWithLinks } from "./connection";
import { youtubeVideo, type LinkPlatform } from "./links";

// One card per link, newest email first. Something sent more than once shows
// once, from the most recent email; for YouTube that's per video, so a plain
// link and a timestamped link to the same video don't make two cards.
export type FeedItem = {
  key: string;
  url: string;
  platform: LinkPlatform;
  from: string;
  subject: string;
  date: string | null;
};

export function toFeedItems(emails: EmailWithLinks[]): FeedItem[] {
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const email of emails) {
    for (const link of email.links) {
      const id = link.platform === "youtube" ? (youtubeVideo(link.url)?.id ?? link.url) : link.url;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ key: `${email.id}:${link.url}`, url: link.url, platform: link.platform, from: email.from, subject: email.subject, date: email.date });
    }
  }
  return items;
}
