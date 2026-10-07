// "Report a problem": what's kept about the page, the screen size and the
// text. Run with `npm test`.
import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_MAX, checkMessage, pageName, pagePattern, screenSize } from "../src/lib/problem-report.ts";

test("the page is kept as a pattern: ids, search terms and #fragments removed", () => {
  assert.equal(pagePattern("/events"), "/events");
  assert.equal(pagePattern("/events/7b0c2a4e-1d2f-4c7e-9a1b-0c3d5e7f9a1b"), "/events/:id");
  assert.equal(
    pagePattern("/events/7b0c2a4e-1d2f-4c7e-9a1b-0c3d5e7f9a1b/players/31c0d6aa-0000-4000-8000-000000000000?tab=also"),
    "/events/:id/players/:id",
  );
  assert.equal(pagePattern("/docket/card/18f3a9c2b7d4e601?from=search"), "/docket/card/:id");
  assert.equal(pagePattern("/docket/card/AAMkADk0ZjE2LTQ5o2AAA-BAAAAAAEMAAAx_yo2AAA%3D"), "/docket/card/:id");
  assert.equal(pagePattern("/docket?q=Jordan%20Blake#top"), "/docket");
  assert.equal(pagePattern("/players/Jordan%20Blake"), "/players/:id");
  assert.equal(pagePattern("/docket/card/deadbeefcafe"), "/docket/card/:id", "only Briefcase's own route words are kept");
  assert.equal(pagePattern("/events/:id/../../players"), "/events/:id/:id/:id/players");
  assert.equal(pagePattern("/"), "/");
  assert.ok(pagePattern("/a/".repeat(500)).length <= 200);
});

test("the notification gets only a short page name", () => {
  assert.equal(pageName("/events/:id/players/:id"), "Player");
  assert.equal(pageName("/events/:id"), "Event");
  assert.equal(pageName("/events"), "Events");
  assert.equal(pageName("/docket/review"), "Reviewing players");
  assert.equal(pageName("/docket/shortlist"), "Shortlist");
  assert.equal(pageName("/docket"), "The Docket");
  assert.equal(pageName("/profile"), "Profile");
  assert.equal(pageName("/something/else"), "Other page");
});

test("screen size: only a width×height@ratio", () => {
  assert.equal(screenSize("390x844@3"), "390x844@3");
  assert.equal(screenSize("1180x820@2"), "1180x820@2");
  assert.equal(screenSize("820x1180@1.5"), "820x1180@1.5");
  assert.equal(screenSize("Jordan Blake"), null);
  assert.equal(screenSize(42), null);
});

test("the text is required and at most 1,000 characters", () => {
  assert.equal(REPORT_MAX, 1000);
  assert.deepEqual(checkMessage("  The search bar does nothing  "), { text: "The search bar does nothing" });
  assert.ok("error" in checkMessage("   "));
  assert.ok("error" in checkMessage(undefined));
  assert.deepEqual(checkMessage("x".repeat(1000)), { text: "x".repeat(1000) });
  assert.ok("error" in checkMessage("x".repeat(1001)));
});
