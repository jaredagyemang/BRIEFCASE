"use server";

import { redirect } from "next/navigation";
import { LEGAL_VERSION } from "@/content/legal";
import { onboardingStep, safeNext, welcomePath } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// "I agree" on the Privacy Policy and Terms of Use: records it for this
// coach (with the version and time), then on to the tutorial or the app.
export async function acceptTermsAction(_prev: { error?: string } | null, formData: FormData) {
  const next = safeNext(formData.get("next"));
  // The text changed while it was open: read the new one.
  if (formData.get("version") !== LEGAL_VERSION) {
    return { error: "The Privacy Policy and Terms were just updated. Please read them again.", outdated: true };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { error } = await supabase.rpc("accept_terms", { terms_version: LEGAL_VERSION });
  if (error) {
    console.error("Recording terms acceptance failed", error.message);
    return { error: "Couldn’t save that. Check your connection and try again." };
  }
  const step = await onboardingStep(supabase, String(data.claims.sub)).catch(() => "tutorial" as const);
  redirect(step === "done" ? next : welcomePath(step === "terms" ? "terms" : "tutorial", next));
}

// Finishing (or skipping) the welcome tutorial.
export async function completeTutorialAction(next: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { error } = await supabase
    .from("staff")
    .update({ tutorial_completed_at: new Date().toISOString() })
    .eq("id", String(data.claims.sub))
    .is("tutorial_completed_at", null);
  if (error) console.error("Recording tutorial done failed", error.message);
  redirect(safeNext(next));
}
