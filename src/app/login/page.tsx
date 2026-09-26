"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { BrandLogo } from "@/components/brand-logo";
import { inputClass } from "@/components/ui";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="text-center">
        <h1>
          <BrandLogo variant="full" className="mx-auto w-60" />
        </h1>
        <p className="mt-4 text-muted">Sign in with your staff login.</p>
      </div>

      <form action={formAction} className="mt-8 space-y-3">
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email}
          placeholder="Email"
          required
          className={inputClass}
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
          className={inputClass}
        />
        {state?.error && (
          <p className="px-1 text-sm text-red" aria-live="polite">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
