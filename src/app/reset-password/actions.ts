"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error: string; field?: "password" | "confirm" } | { expired: true } | undefined;

const MIN = 8;
// Supabase can't store passwords longer than 72 characters.
const MAX = 72;

// Set once this browser has used a reset link, so a second try (after e.g.
// "that's your current password") doesn't need the link again: it only
// works once.
const VERIFIED_COOKIE = "briefcase-reset-verified";

// Checks the emailed link, which signs the coach in, then sets their new
// password. The link is only used once the passwords are valid, so a typo
// doesn't waste it.
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
    cookieStore.set(VERIFIED_COOKIE, data.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/reset-password",
      maxAge: 15 * 60,
    });
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
  redirect("/events?password=updated");
}
