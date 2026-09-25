"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eventPath } from "@/lib/events";
import { submittedValues, text, type FormState } from "@/lib/form";
import { createAuthedClient } from "@/lib/supabase/server";

export type EventFormState = FormState;

function parseEvent(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const name = text(formData, "name");
  if (!name) fieldErrors.name = "Give the event a name";
  else if (name.length > 120) fieldErrors.name = "Keep it under 120 characters";

  const event_date = text(formData, "event_date");
  if (!event_date || !/^\d{4}-\d{2}-\d{2}$/.test(event_date) || Number.isNaN(Date.parse(event_date))) {
    fieldErrors.event_date = "Pick a date";
  }
  return { row: { name: name ?? "", event_date: event_date ?? "" }, fieldErrors };
}

export async function createEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const { row, fieldErrors } = parseEvent(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values: submittedValues(formData) };
  }

  const supabase = await createAuthedClient();
  const { data, error } = await supabase.from("events").insert(row).select("id").single();
  if (error) return { error: "Couldn't create the event. Try again.", values: submittedValues(formData) };

  revalidatePath("/events", "layout");
  redirect(eventPath(data.id));
}

export async function updateEvent(eventId: string, _prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const { row, fieldErrors } = parseEvent(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors, values: submittedValues(formData) };
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase.from("events").update(row).eq("id", eventId);
  if (error) return { error: "Couldn't save the event. Try again.", values: submittedValues(formData) };

  revalidatePath("/events", "layout");
  redirect(eventPath(eventId));
}

// Closing moves an event to Previous Showcases. Nothing is locked; reopening
// moves it back.
export async function setEventStatus(eventId: string, status: "active" | "closed") {
  if (status !== "active" && status !== "closed") throw new Error("Invalid status");
  const supabase = await createAuthedClient();
  const { error } = await supabase
    .from("events")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
  revalidatePath("/events", "layout");
}
