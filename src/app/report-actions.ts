"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { checkMessage, pageName, pagePattern, screenSize } from "@/lib/problem-report";
import { createClient } from "@/lib/supabase/server";

export type ReportResult = { ok: true } | { ok: false; error: string };

// "Report a problem": saved as the signed-in coach (row-level security only
// lets a coach add reports as themselves; nobody can read them in the app).
// The browser/device comes from the request and the app version from the
// server, so the form only sends the text, the page and the screen size.
export async function reportProblemAction(input: { message: string; page: string; screen: string }): Promise<ReportResult> {
  const checked = checkMessage(input?.message);
  if ("error" in checked) return { ok: false, error: checked.error };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, error: "Sign in again, then send your report." };

  const page = pagePattern(input.page ?? "");
  const { error } = await supabase.from("problem_reports").insert({
    page,
    user_agent: ((await headers()).get("user-agent") ?? "").slice(0, 500) || null,
    screen: screenSize(input.screen),
    app_version: process.env.APP_VERSION?.slice(0, 64) ?? null,
    message: checked.text,
  });
  if (error) {
    if (error.message.includes("problem_report_rate_limited")) {
      return { ok: false, error: "You’ve sent a lot of reports in the last hour. Please try again later." };
    }
    console.error("Saving a problem report failed", error.code, error.message);
    return { ok: false, error: "Couldn’t send your report. Check your connection and try again." };
  }

  // A heads-up on the owner's phone, after the coach has their answer. Only
  // the page's name: never the text, the coach or anything about players.
  // No topic, or ntfy unreachable: nothing happens (the report is saved).
  after(() => notifyNewReport(pageName(page)));
  return { ok: true };
}

async function notifyNewReport(page: string) {
  const topic = process.env.NTFY_TOPIC?.trim();
  if (!topic) return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    console.error("NTFY_TOPIC isn't a valid ntfy topic name (letters, numbers, - and _ only, up to 64).");
    return;
  }
  const server = (process.env.NTFY_URL?.trim() || "https://ntfy.sh").replace(/\/+$/, "");
  try {
    const response = await fetch(`${server}/${topic}`, {
      method: "POST",
      body: `New BRIEFCASE problem report: ${page}`,
      headers: { Title: "BRIEFCASE" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("ntfy didn't accept the problem report notice", response.status);
  } catch (error) {
    console.error("Couldn't reach ntfy for the problem report notice", error instanceof Error ? error.message : error);
  }
}
