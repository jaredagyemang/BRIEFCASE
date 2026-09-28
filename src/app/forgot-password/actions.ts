"use server";

import { headers } from "next/headers";
import { isEmail } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export type ForgotState = { sent: true; email: string } | { sent: false; error: string; email: string } | undefined;

// Asks Supabase to email a password reset link. The answer is the same
// whether or not the email has an account, so the form can't be used to
// find out who has one.
export async function sendResetLink(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isEmail(email)) return { sent: false, error: "Enter the email you sign in with.", email };

  // The link opens /reset-password on the address the coach is using
  // (localhost, the live site or a preview). Supabase only sends people to
  // addresses on its Redirect URLs list.
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  // Not shown: an unknown email, a request too soon after the last one, or
  // a mail problem all look the same to the coach.
  if (error) console.error("Password reset email failed", error.status, error.code, error.message);

  return { sent: true, email };
}
