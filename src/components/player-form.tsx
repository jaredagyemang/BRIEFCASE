"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Player } from "@/lib/players";
import type { PlayerFormState } from "@/app/players/actions";
import { inputClass, labelClass } from "@/components/ui";

type Props = {
  action: (state: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
  player?: Player;
  submitLabel: string;
  cancelHref: string;
};

type FieldProps = {
  name: keyof Player;
  label: string;
  defaultValue: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">;

function Field({ name, label, defaultValue, error, ...inputProps }: FieldProps) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        className={`${inputClass} ${error ? "border-red" : ""}`}
        {...inputProps}
      />
      {error && <span className="mt-1 block px-1 text-sm text-red">{error}</span>}
    </label>
  );
}

export function PlayerForm({ action, player, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

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

      {state?.error && (
        <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red" aria-live="polite">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Link
          href={cancelHref}
          className="flex-1 rounded-2xl bg-surface-muted py-3.5 text-center font-semibold"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
