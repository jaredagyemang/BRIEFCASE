"use client";

import { useActionState } from "react";
import { updateMyName } from "./actions";
import { inputClass, labelClass } from "@/components/ui";

export function AccountForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateMyName, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className={labelClass}>Your name</span>
        <input
          name="full_name"
          defaultValue={state?.name ?? name}
          autoComplete="name"
          required
          className={inputClass}
        />
      </label>
      <p className="px-1 text-sm text-muted">Shown next to the ratings you make.</p>
      {state?.error && <p className="px-1 text-sm text-red">{state.error}</p>}
      {state?.saved && !pending && <p className="px-1 text-sm text-green">Saved</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
