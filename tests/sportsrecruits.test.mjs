// SportsRecruits profile links: recognised in made-up Gmail and Outlook
// emails, opened only by the coach, and saved only as the plain public
// address. Run with `npm test`. The players and links here are invented.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyLink, extractLinks, profileLinks, publicLink, swipeMedia, uniqueMedia } from "../src/lib/gmail/links.ts";

// A link shaped like the ones in SportsRecruits messages: the public profile
// address plus tracking / sign-in data (made up).
const TRACKED =
  "https://my.sportsrecruits.com/athlete/rowan_example_2028?utm_source=sr_message&utm_medium=email&t=XXXX&login_token=XXXX#film";
const PUBLIC = "https://my.sportsrecruits.com/athlete/rowan_example_2028";

// A Gmail message body (HTML, with Google's click wrapping on one link).
const GMAIL_SR_ONLY = `<p>Hi Coach, I'm Rowan Example, a 2028 center midfielder for Example FC 08G.</p>
<p>My profile and film: <a href="${TRACKED.replace(/&/g, "&amp;")}">View my SportsRecruits profile</a></p>
<p><a href="https://www.google.com/url?q=${encodeURIComponent(TRACKED)}&amp;sa=D">profile again</a></p>
<footer><a href="https://sportsrecruits.com/">SportsRecruits</a> · <a href="https://my.sportsrecruits.com/settings/notifications">Notification settings</a></footer>`;

// An Outlook message body with a YouTube video as well.
const OUTLOOK_MIXED = `<div>Coach, Casey Sample here (2027 GK, Sample United).</div>
<div>Highlights: <a href="https://youtu.be/fakevid0001">YouTube</a></div>
<div>Full profile: <a href="https://my.sportsrecruits.com/athlete/casey_sample/film?ref=XXXX">SportsRecruits</a></div>`;

test("recognises a profile link on any sportsrecruits.com address, as sent", () => {
  assert.deepEqual(classifyLink(TRACKED), { url: TRACKED, platform: "sportsrecruits" });
  assert.equal(classifyLink("https://sportsrecruits.com/athlete/rowan_example_2028")?.platform, "sportsrecruits");
  assert.equal(classifyLink("https://www.sportsrecruits.com/athlete/rowan.example-2/")?.platform, "sportsrecruits");
});

test("ignores SportsRecruits links that aren't a player's profile", () => {
  for (const url of [
    "https://sportsrecruits.com/",
    "https://my.sportsrecruits.com/settings/notifications",
    "https://my.sportsrecruits.com/athlete/",
    "https://help.sportsrecruits.com/hc/en-us/articles/1",
    "https://evil.example/my.sportsrecruits.com/athlete/rowan",
    "https://sportsrecruits.com.evil.example/athlete/rowan",
    "ftp://my.sportsrecruits.com/athlete/rowan",
  ]) {
    assert.equal(classifyLink(url), null, url);
  }
});

test("saved copies keep only the public address: no query, path after the username, fragment or sign-in data", () => {
  assert.deepEqual(publicLink({ url: TRACKED, platform: "sportsrecruits" }), { url: PUBLIC, platform: "sportsrecruits" });
  assert.equal(
    publicLink({ url: "https://user:secret@my.sportsrecruits.com/athlete/casey_sample/film?ref=XXXX", platform: "sportsrecruits" }).url,
    "https://my.sportsrecruits.com/athlete/casey_sample",
  );
  assert.equal(publicLink({ url: "http://sportsrecruits.com/athlete/casey_sample", platform: "sportsrecruits" }).url, "https://my.sportsrecruits.com/athlete/casey_sample");
  // Other links are saved as they are.
  const yt = { url: "https://youtu.be/fakevid0001?t=30", platform: "youtube" };
  assert.deepEqual(publicLink(yt), yt);
});

test("Gmail, SportsRecruits only: one profile, nothing to swipe", () => {
  const links = extractLinks(GMAIL_SR_ONLY);
  assert.equal(links.length, 1, "the plain and Google-wrapped copies are the same link; footer links aren't profiles");
  assert.equal(links[0].platform, "sportsrecruits");
  assert.equal(links[0].url, TRACKED, "the coach's own button keeps the link as sent");
  assert.deepEqual(swipeMedia(links), []);
  assert.equal(profileLinks(links).length, 1);
  assert.deepEqual(uniqueMedia(links).map(publicLink), [{ url: PUBLIC, platform: "sportsrecruits" }]);
});

test("Outlook, mixed: the YouTube video to swipe, the profile as a button", () => {
  const links = extractLinks(OUTLOOK_MIXED);
  assert.deepEqual(
    swipeMedia(links).map((l) => l.platform),
    ["youtube"],
  );
  assert.equal(profileLinks(links)[0].url, "https://my.sportsrecruits.com/athlete/casey_sample/film?ref=XXXX");
  assert.deepEqual(
    uniqueMedia(links).map(publicLink).map((l) => l.url),
    ["https://youtu.be/fakevid0001", "https://my.sportsrecruits.com/athlete/casey_sample"],
  );
});

test("the same profile twice (different tracking) counts once", () => {
  const links = extractLinks(`${TRACKED} and https://my.sportsrecruits.com/athlete/ROWAN_EXAMPLE_2028?t=other`);
  assert.equal(profileLinks(links).length, 1);
});

test("the roster reader refuses SportsRecruits pages without connecting", async () => {
  const { fetchRosterPage } = await import("../src/lib/roster-link.ts");
  for (const url of ["https://my.sportsrecruits.com/athlete/rowan_example_2028", "https://sportsrecruits.com/team/example"]) {
    await assert.rejects(fetchRosterPage(url), /doesn’t open SportsRecruits pages/);
  }
});
