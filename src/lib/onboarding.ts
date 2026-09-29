import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSION } from "@/content/legal";

// First use: accept the Privacy Policy and Terms of Use, then the welcome
// tutorial. Used by the proxy (every page) and the /welcome screens.

// Remembers, per browser, that this coach is past both steps for the current
// version of the text, so pages don't look it up every time. It only skips
// the check; the record of agreeing is in the database.
export const ONBOARDED_COOKIE = "briefcase_onboarded";
export const onboardedMark = (userId: string) => `${userId}:${LEGAL_VERSION}`;

export type OnboardingStep = "terms" | "tutorial" | "done";

// Postgres "table/column doesn't exist": the migration hasn't been run yet.
const NOT_SET_UP = new Set(["42P01", "42703", "PGRST205", "PGRST204"]);

export async function onboardingStep(supabase: SupabaseClient, userId: string): Promise<OnboardingStep> {
  const [terms, staff] = await Promise.all([
    supabase.from("terms_acceptances").select("id").eq("staff_id", userId).eq("version", LEGAL_VERSION).limit(1),
    supabase.from("staff").select("tutorial_completed_at").eq("id", userId).maybeSingle(),
  ]);
  const error = terms.error ?? staff.error;
  if (error) {
    // Before 20261011000000_terms_and_tutorial.sql is run, don't lock
    // everyone out of the app.
    if (error.code && NOT_SET_UP.has(error.code)) {
      console.error("First-use screens are off: run 20261011000000_terms_and_tutorial.sql", error.message);
      return "done";
    }
    throw new Error(error.message);
  }
  if (!terms.data?.length) return "terms";
  if (staff.data && !staff.data.tutorial_completed_at) return "tutorial";
  return "done";
}

// Where to go afterwards: a page in this app only.
export function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/welcome")
    ? next
    : "/events";
}

export const welcomePath = (step: "terms" | "tutorial", next: string) =>
  `${step === "terms" ? "/welcome/terms" : "/welcome"}${next === "/events" ? "" : `?next=${encodeURIComponent(next)}`}`;

// Where to send a coach who just signed in (or set a new password): first
// use if it isn't finished, otherwise `next`. (A Server Action's redirect
// doesn't pass through the proxy's check, so it's done here too.)
export async function landingPath(supabase: SupabaseClient, next: string) {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return next;
  const step = await onboardingStep(supabase, String(data.claims.sub)).catch(() => "terms" as const);
  return step === "done" ? next : welcomePath(step, next);
}
