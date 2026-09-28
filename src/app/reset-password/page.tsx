import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Set a new password · Briefcase" };

// Opened from the reset email: /reset-password?token_hash=…&type=recovery.
// The link is only checked when the new password is saved (see actions.ts),
// so email scanners that open links can't use it up.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" && params.type === "recovery" ? params.token_hash : "";

  return <ResetPasswordForm tokenHash={tokenHash} />;
}
