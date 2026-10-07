import { redirect } from "next/navigation";
import { Tutorial } from "@/components/tutorial";
import { onboardingStep, safeNext, welcomePath } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// First use, step 2: the welcome tutorial (after agreeing to the terms).
// ?replay=1 (Profile → Replay tutorial) shows it again to a coach who has
// already finished it; otherwise they go straight on.
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const step = await onboardingStep(supabase, String(data.claims.sub)).catch(() => "tutorial" as const);
  // The Privacy Policy and Terms always come first.
  if (step === "terms") redirect(welcomePath("terms", next));
  if (step === "done" && params.replay !== "1") redirect(next);
  return <Tutorial next={next} />;
}
