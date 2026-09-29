import { redirect } from "next/navigation";
import { Tutorial } from "@/components/tutorial";
import { onboardingStep, safeNext, welcomePath } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// First use, step 2: the welcome tutorial (after agreeing to the terms).
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const next = safeNext((await searchParams).next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const step = await onboardingStep(supabase, String(data.claims.sub)).catch(() => "tutorial" as const);
  if (step === "terms") redirect(welcomePath("terms", next));
  return <Tutorial next={next} />;
}
