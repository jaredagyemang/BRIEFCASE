"use client";

import { useActionState } from "react";
import { sendResetLink } from "@/app/forgot-password/actions";
import { inputClass } from "@/components/ui";

// Email → "send reset link", then the same neutral confirmation whether or
// not the email has an account.
export function ForgotPasswordForm({ submitLabel = "Send reset link" }: { submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(sendResetLink, undefined);

  if (state?.sent) {
    return (
      <div role="status" className="rounded-3xl bg-surface p-6 text-center">
        <p className="text-4xl">📬</p>
        <p className="mt-3 font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          If <span className="font-medium text-foreground">{state.email}</span> has an account, a reset link is on its
          way. It works for 1 hour.
        </p>
        <p className="mt-3 text-sm text-muted">Nothing after a few minutes? Check your spam folder, or try again.</p>
        <form action={formAction} className="mt-4">
          <input type="hidden" name="email" value={state.email} />
          <button
            type="submit"
            disabled={pending}
            className="text-sm font-semibold text-accent-ink disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send it again"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        defaultValue={state?.email}
        placeholder="Email"
        aria-label="Email"
        aria-invalid={Boolean(state?.error) || undefined}
        aria-describedby={state?.error ? "forgot-error" : undefined}
        required
        className={inputClass}
      />
      {state?.error && (
        <p id="forgot-error" className="px-1 text-sm text-red" aria-live="polite">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
