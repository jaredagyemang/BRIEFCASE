"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { isEmail } from "@/lib/form";

export type ForgotState = { sent: true; email: string } | { sent: false; error: string; email: string } | undefined;

// Asks Supabase to email a password reset link. The answer is the same
// whether or not the email has an account, so the form can't be used to
// find out who has one.
export async function sendResetLink(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isEmail(email)) return { sent: false, error: "Enter the email you sign in with.", email };

  // The link opens /reset-password/callback on the address the coach is
  // using (localhost, the live site or a preview). Supabase only sends
  // people to addresses on its Redirect URLs list.
  const origin = (await headers()).get("origin") ?? "";
  // "implicit": the link signs the coach in by itself, so it works for its
  // full hour and on any device. (The default "PKCE" flow only works in the
  // browser that asked, within 5 minutes.)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password/callback`,
  });
  // Not shown: an unknown email, a request too soon after the last one, or
  // a mail problem all look the same to the coach.
  if (error) console.error("Password reset email failed", error.status, error.code, error.message);

  return { sent: true, email };
}
