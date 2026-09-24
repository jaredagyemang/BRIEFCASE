"use client";

import { useActionState } from "react";
import { updateMyName } from "./actions";

// Inline name editor styled as a settings row.
export function NameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateMyName, undefined);

  return (
    <form action={formAction} className="px-4 py-3">
      <label className="flex items-center gap-3">
        <span className="shrink-0 text-muted">Name</span>
        <input
          name="full_name"
          defaultValue={state?.name ?? name}
          autoComplete="name"
          required
          className="min-w-0 flex-1 bg-transparent text-right font-medium outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </label>
      {state?.error && <p className="mt-2 text-sm text-red">{state.error}</p>}
      {state?.saved && !pending && <p className="mt-2 text-sm text-green">Saved</p>}
    </form>
  );
}
