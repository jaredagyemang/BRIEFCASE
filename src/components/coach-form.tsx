"use client";

import { useActionState } from "react";
import type { Coach } from "@/lib/coaches";
import type { CoachFormState } from "@/app/coaches/actions";
import { Field, FormFooter, TextAreaField } from "@/components/form";

type Props = {
  action: (state: CoachFormState, formData: FormData) => Promise<CoachFormState>;
  coach?: Coach;
  submitLabel: string;
  cancelHref: string;
};

export function CoachForm({ action, coach, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  // Props for a field: prefer what was just submitted, then the saved coach.
  const field = (name: keyof Coach) => ({
    name,
    defaultValue: state?.values[name] ?? coach?.[name]?.toString() ?? "",
    error: state?.fieldErrors?.[name],
  });

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field {...field("first_name")} label="First name" autoComplete="off" required />
        <Field {...field("last_name")} label="Last name" autoComplete="off" required />
      </div>
      <Field {...field("title")} label="Title" placeholder="Head Coach, Assistant Coach…" />
      <Field {...field("email")} label="Email" type="email" autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <Field {...field("cell_phone")} label="Cell phone" type="tel" autoComplete="off" />
        <Field {...field("office_phone")} label="Office phone" type="tel" autoComplete="off" />
      </div>
      <TextAreaField {...field("notes")} label="Notes" placeholder="Program, recruiting needs, last conversation…" />

      <FormFooter
        error={state?.error}
        pending={pending}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
      />
    </form>
  );
}
