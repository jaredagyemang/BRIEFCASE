"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { Player } from "@/lib/players";
import type { PlayerFormState } from "@/app/players/actions";
import { Field, FormFooter } from "@/components/form";

type Props = {
  action: (state: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
  player?: Player;
  submitLabel: string;
  cancelHref: string;
};

export function PlayerForm({ action, player, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const duplicateRef = useRef<HTMLDivElement>(null);

  // Bring the duplicate warning into view; on a phone it can land off-screen.
  useEffect(() => {
    if (state?.duplicates) duplicateRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  // Props for a field: prefer what was just submitted, then the saved player.
  const field = (name: keyof Player) => ({
    name,
    defaultValue: state?.values[name] ?? player?.[name]?.toString() ?? "",
    error: state?.fieldErrors?.[name],
  });

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field {...field("first_name")} label="First name" autoComplete="off" required />
        <Field {...field("last_name")} label="Last name" autoComplete="off" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field {...field("grad_year")} label="Grad year" inputMode="numeric" placeholder="2027" />
        <Field {...field("position")} label="Position" placeholder="Midfielder" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field {...field("club_team")} label="Club team" />
        <Field {...field("gpa")} label="GPA" inputMode="decimal" placeholder="3.50" />
      </div>
      <Field {...field("phone")} label="Phone" type="tel" autoComplete="off" />
      <Field {...field("email")} label="Email" type="email" autoComplete="off" />

      {state?.duplicates && (
        <div
          ref={duplicateRef}
          className="scroll-mb-24 rounded-2xl border border-yellow/40 bg-yellow/10 p-4"
          role="alert"
        >
          <p className="font-semibold">⚠️ Possible duplicate</p>
          <p className="mt-0.5 text-sm text-muted">
            {state.duplicates.length === 1 ? "This player" : "These players"} already{" "}
            {state.duplicates.length === 1 ? "has" : "have"} the same name and grad year:
          </p>
          <ul className="mt-3 space-y-2">
            {state.duplicates.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  {d.detail && <p className="truncate text-sm text-muted">{d.detail}</p>}
                </div>
                <Link
                  href={`/players/${d.id}`}
                  className="shrink-0 rounded-full bg-surface-muted px-3.5 py-1.5 text-sm font-semibold"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="submit"
            name="confirm_duplicates"
            value={state.duplicates.map((d) => d.id).join(",")}
            disabled={pending}
            className="mt-3 w-full rounded-full bg-surface py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? "Saving…" : "Not a duplicate — save anyway"}
          </button>
        </div>
      )}

      <FormFooter
        error={state?.error}
        pending={pending}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
      />
    </form>
  );
}
