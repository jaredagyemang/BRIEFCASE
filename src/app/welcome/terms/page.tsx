import { redirect } from "next/navigation";
import { TermsGate } from "@/components/terms-gate";
import { LEGAL_DRAFT, LEGAL_VERSION, PRIVACY_POLICY, TERMS_OF_USE } from "@/content/legal";
import { onboardingStep, safeNext, welcomePath } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// First use, step 1: read and agree to the Privacy Policy and Terms of Use.
// Required before anything else in the app.
export default async function TermsPage({ searchParams }: PageProps<"/welcome/terms">) {
  const next = safeNext((await searchParams).next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const step = await onboardingStep(supabase, String(data.claims.sub)).catch(() => "terms" as const);
  if (step === "tutorial") redirect(welcomePath("tutorial", next));
  if (step === "done") redirect(next);

  return (
    <TermsGate version={LEGAL_VERSION} draft={LEGAL_DRAFT} privacy={PRIVACY_POLICY} terms={TERMS_OF_USE} next={next} />
  );
}
