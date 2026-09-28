"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { startResetSession } from "@/app/reset-password/callback/actions";
import { AuthScreen } from "@/components/auth-screen";

// Handles both kinds of reset email link, then goes to /reset-password:
//
// - Supabase's default email ({{ .ConfirmationURL }}): Supabase checks the
//   link, then sends the browser here with a session after the #
//   (#access_token=…&refresh_token=…&type=recovery), or an error
//   (#error_code=otp_expired…) if the link was expired or already used.
// - A customized email template ({{ .RedirectTo }}?token_hash=…): passed on
//   as is. /reset-password checks it only when the new password is saved,
//   so email scanners that open links can't use it up.
export function ResetCallback() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Keep the session out of the address bar and browser history.
    window.history.replaceState(null, "", window.location.pathname);

    const tokenHash = query.get("token_hash");
    if (tokenHash) {
      router.replace(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
      return;
    }
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access || !refresh || hash.get("type") !== "recovery") {
      router.replace("/reset-password?problem=expired");
      return;
    }
    startResetSession(access, refresh).then(
      (result) => router.replace(result.ok ? "/reset-password?ready=1" : "/reset-password?problem=expired"),
      () => router.replace("/reset-password?problem=expired"),
    );
  }, [router]);

  return (
    <AuthScreen title="Checking your link…">
      <p className="flex items-center justify-center gap-2 text-muted" role="status">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        One moment
      </p>
    </AuthScreen>
  );
}
