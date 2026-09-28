import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { VERIFIED_COOKIE, type ResetProblem } from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set a new password · Briefcase" };

// "Set a new password", reached from the reset email's link via
// /reset-password/callback, either:
// - ?token_hash=…&type=recovery (customized email template): the link is
//   only checked when the new password is saved, so email scanners that
//   open links can't use it up; or
// - ?ready=1 (Supabase's default email): the link was already used and this
//   browser is signed in and marked as verified (see callback/actions.ts).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" && params.type === "recovery" ? params.token_hash : "";

  let verified = false;
  if (!tokenHash && params.ready === "1") {
    const verifiedFor = (await cookies()).get(VERIFIED_COOKIE)?.value;
    const { data } = await (await createClient()).auth.getClaims();
    verified = Boolean(verifiedFor) && verifiedFor === data?.claims?.sub;
  }

  const problem: ResetProblem | null = tokenHash || verified ? null : "expired";
  return <ResetPasswordForm tokenHash={tokenHash} problem={problem} />;
}
