"use client";

import { useActionState, useEffect, useRef } from "react";
import type { EventFormState } from "@/app/events/actions";
import { Field, FormFooter } from "@/components/form";

type Props = {
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>;
  name?: string;
  // Omit for a new event: the browser fills in today's local date.
  eventDate?: string;
  submitLabel: string;
  cancelHref: string;
};

export function EventForm({ action, name, eventDate, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const input = formRef.current?.elements.namedItem("event_date");
    if (input instanceof HTMLInputElement && !input.value) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      input.value = now.toISOString().slice(0, 10);
    }
  }, []);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <Field
        name="name"
        label="Event name"
        defaultValue={state?.values.name ?? name ?? ""}
        error={state?.fieldErrors?.name}
        placeholder="e.g. ECNL Ohio — June 2026"
        autoComplete="off"
        required
      />
      <Field
        name="event_date"
        label="Date"
        type="date"
        defaultValue={state?.values.event_date ?? eventDate ?? ""}
        error={state?.fieldErrors?.event_date}
        required
      />
      <FormFooter error={state?.error} pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
