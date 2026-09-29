"use server";

import { redirect } from "next/navigation";
import { landingPath } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string; email: string } | undefined;

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get("password") ?? ""),
  });

  if (error) {
    return { error: "That email and password didn't match.", email };
  }
  // First use (the terms, then the tutorial) if it isn't finished.
  redirect(await landingPath(supabase, "/events"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
