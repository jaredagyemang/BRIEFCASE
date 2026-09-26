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

export type EventDeletionPreview = {
  players: number;
  // Seen only at this event, so deleting it removes them from Briefcase.
  onlyHere: number;
  entries: number;
};

// What deleting an event would remove, shown in the confirmation prompt.
export async function previewEventDeletion(eventId: string): Promise<EventDeletionPreview> {
  const supabase = await createAuthedClient();
  const [{ data: appearances, error }, { count: entries }] = await Promise.all([
    supabase
      .from("event_players")
      .select("player:players!inner(event_players(event_id))")
      .eq("event_id", eventId)
      .returns<{ player: { event_players: { event_id: string }[] } }[]>(),
    supabase.from("evaluations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);
  if (error) throw new Error(error.message);
  return {
    players: appearances.length,
    onlyHere: appearances.filter((a) => a.player.event_players.every((ep) => ep.event_id === eventId)).length,
    entries: entries ?? 0,
  };
}

// Permanently deletes an event with its ratings, notes and jersey numbers.
// Players also seen at other events stay; players only seen here are removed.
export async function deleteEvent(
  eventId: string,
  goToEvents = false,
): Promise<{ error: string } | undefined> {
  const supabase = await createAuthedClient();
  const { data, error } = await supabase.rpc("delete_event", { target_event_id: eventId });
  const files = data as { bucket: string; path: string }[] | null;
  if (error) return { error: "Couldn't delete the event. Try again." };

  // The notes are gone either way; a leftover file is only wasted storage.
  for (const bucket of ["voice-notes", "note-photos"] as const) {
    const paths = (files ?? []).filter((f) => f.bucket === bucket).map((f) => f.path);
    if (!paths.length) continue;
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) console.error(`Couldn't remove ${bucket} files for deleted event`, eventId, removeError);
  }

  revalidatePath("/events", "layout");
  if (goToEvents) redirect("/events");
}
