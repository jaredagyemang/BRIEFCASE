"use server";

import { cookies } from "next/headers";
import { VERIFIED_COOKIE, VERIFIED_COOKIE_OPTIONS } from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

// Supabase's default reset email signs the coach in by putting a session in
// the link (after the #, which only the browser sees). This stores it as the
// usual sign-in cookies and marks this browser as allowed to set a new
// password.
export async function startResetSession(accessToken: string, refreshToken: string): Promise<{ ok: boolean }> {
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || !accessToken || !refreshToken) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.user) {
    console.error("Password reset link failed", error?.status, error?.code, error?.message);
    return { ok: false };
  }
  (await cookies()).set(VERIFIED_COOKIE, data.user.id, VERIFIED_COOKIE_OPTIONS);
  return { ok: true };
}
