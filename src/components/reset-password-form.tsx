"use client";

import { useActionState, useState } from "react";
import { setNewPassword } from "@/app/reset-password/actions";
import { AuthScreen } from "@/components/auth-screen";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { inputClass } from "@/components/ui";
import type { ResetProblem } from "@/lib/password-reset";

// New password twice, then save. If the link can't be used (expired or
// already used), offers a new one right here.
export function ResetPasswordForm({ tokenHash, problem }: { tokenHash: string; problem: ResetProblem | null }) {
  const [state, formAction, pending] = useActionState(setNewPassword, undefined);
  const [show, setShow] = useState(false);
  // Kept in state so a mistake (e.g. passwords that don't match) doesn't
  // clear what the coach typed.
  const [values, setValues] = useState({ password: "", confirm: "" });

  if (problem === "expired" || (state && "expired" in state)) {
    return (
      <AuthScreen title="This link has expired" subtitle="Reset links work once, for 1 hour. Send yourself a new one.">
        <div role="alert" className="mb-4 rounded-2xl bg-red/10 px-4 py-3 text-sm font-medium text-red">
          This link has expired or was already used.
        </div>
        <ForgotPasswordForm submitLabel="Send a new link" />
      </AuthScreen>
    );
  }

  const error = state && "error" in state ? state : null;
  const field = (name: "password" | "confirm", placeholder: string) => (
    <div>
      <input
        name={name}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={error?.field === name || undefined}
        aria-describedby={error?.field === name ? "reset-error" : undefined}
        minLength={8}
        maxLength={72}
        required
        className={`${inputClass} ${error?.field === name ? "border-red" : ""}`}
      />
    </div>
  );

  return (
    <AuthScreen title="Set a new password" subtitle="Choose a password with at least 8 characters.">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="token_hash" value={tokenHash} />
        {field("password", "New password")}
        {field("confirm", "New password again")}
        <label className="flex items-center gap-2 px-1 text-sm text-muted">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Show passwords
        </label>
        {error && (
          <p id="reset-error" className="px-1 text-sm text-red" aria-live="polite">
            {error.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthScreen>
  );
}
