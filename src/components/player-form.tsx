"use client";

import { useActionState } from "react";
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

      <FormFooter
        error={state?.error}
        pending={pending}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
      />
    </form>
  );
}
