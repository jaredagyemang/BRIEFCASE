"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { landingPath } from "@/lib/onboarding";
import { VERIFIED_COOKIE, VERIFIED_COOKIE_OPTIONS } from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error: string; field?: "password" | "confirm" } | { expired: true } | undefined;

const MIN = 8;
// Supabase can't store passwords longer than 72 characters.
const MAX = 72;

// Checks the emailed link (token_hash links), which signs the coach in, then
// sets their new password. The link is only used once the passwords are
// valid, so a typo doesn't waste it. With Supabase's default email, the link
// was already used by the callback route, which marks this browser as
// verified.
export async function setNewPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = String(formData.get("token_hash") ?? "");

  if (password.length < MIN) return { error: `Use at least ${MIN} characters.`, field: "password" };
  if (password.length > MAX) return { error: `Use at most ${MAX} characters.`, field: "password" };
  if (password !== confirm) return { error: "The passwords don't match.", field: "confirm" };

  const supabase = await createClient();
  const cookieStore = await cookies();
  const alreadyVerified = cookieStore.get(VERIFIED_COOKIE)?.value;
  const { data: current } = await supabase.auth.getClaims();

  if (!alreadyVerified || alreadyVerified !== current?.claims?.sub) {
    if (!tokenHash) return { expired: true };
    const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error || !data.user) return { expired: true };
    cookieStore.set(VERIFIED_COOKIE, data.user.id, VERIFIED_COOKIE_OPTIONS);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "That's your current password. Choose a new one.", field: "password" };
    }
    if (error.code === "weak_password") {
      return {
        error: "That password is too easy to guess. Try a longer one, or add numbers and symbols.",
        field: "password",
      };
    }
    if (error.code === "session_not_found" || error.status === 401 || error.status === 403) return { expired: true };
    console.error("Setting a new password failed", error.status, error.code, error.message);
    return { error: "Couldn't save your new password. Try again." };
  }

  cookieStore.delete({ name: VERIFIED_COOKIE, path: "/reset-password" });
  // First use (the terms, then the tutorial) if it isn't finished.
  redirect(await landingPath(supabase, "/events?password=updated"));
}
