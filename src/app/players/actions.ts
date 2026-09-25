"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { duplicateKey, type DuplicateMatch } from "@/lib/duplicates";
import { findMatchingPlayers } from "@/lib/duplicates-server";
import { eventPlayerPath } from "@/lib/events";
import { invalid, isEmail, submittedValues, text, type FormState } from "@/lib/form";
import { normalizeGpa } from "@/lib/gpa";
import {
  isLifecycleStatus,
  isTrafficLight,
  type LifecycleStatus,
  type TaskType,
  type TrafficLight,
} from "@/lib/players";
import { createAuthedClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createAuthedClient>>;

// Player pages all live under /events, so refresh that whole section.
function revalidateEvents() {
  revalidatePath("/events", "layout");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Add / edit player
// ---------------------------------------------------------------------------

export type PlayerDuplicate = DuplicateMatch & {
  // Already seen at this event, so there's nothing to add.
  inEvent: boolean;
};

export type PlayerFormState =
  | (NonNullable<FormState> & {
      // Set when the player looks like someone already saved; the form offers
      // adding that player to this event, or saving a new player anyway.
      duplicates?: PlayerDuplicate[];
    })
  | undefined;

// Turns form fields into a players row plus this event's jersey number, or
// returns per-field errors.
function parsePlayer(formData: FormData) {
  const fieldErrors: Record<string, string> = {};

  const first_name = text(formData, "first_name");
  const last_name = text(formData, "last_name");
  if (!first_name) fieldErrors.first_name = "Required";
  if (!last_name) fieldErrors.last_name = "Required";

  const gradYearRaw = text(formData, "grad_year");
  const grad_year = gradYearRaw ? Number(gradYearRaw) : null;
  if (grad_year !== null && !(Number.isInteger(grad_year) && grad_year >= 2000 && grad_year <= 2100)) {
    fieldErrors.grad_year = "Enter a 4-digit year";
  }

  const gpaResult = normalizeGpa(text(formData, "gpa"));
  if (!gpaResult.ok) fieldErrors.gpa = gpaResult.error;
  const gpa = gpaResult.ok ? gpaResult.value : null;

  const jersey_number = text(formData, "jersey_number")?.replace(/^#/, "") ?? null;
  if (jersey_number && jersey_number.length > 10) {
    fieldErrors.jersey_number = "Keep it under 10 characters";
  }

  const email = text(formData, "email");
  if (email && !isEmail(email)) {
    fieldErrors.email = "Enter a valid email";
  }

  const row = {
    first_name: first_name ?? "",
    last_name: last_name ?? "",
    grad_year,
    gpa,
    email,
    position: text(formData, "position"),
    club_team: text(formData, "club_team"),
    phone: text(formData, "phone"),
  };

  return { row, jersey_number, fieldErrors };
}

// Returns a "possible duplicate" response unless the person already chose
// "Save anyway" for exactly these matches.
async function checkDuplicates(
  supabase: Supabase,
  eventId: string,
  row: { first_name: string; last_name: string; grad_year: number | null },
  formData: FormData,
  excludeId?: string,
): Promise<PlayerFormState | null> {
  const matches = await findMatchingPlayers(supabase, row, excludeId);
  if (matches.length === 0) return null;

  const confirmed = new Set(String(formData.get("confirm_duplicates") ?? "").split(",").filter(Boolean));
  if (matches.every((m) => confirmed.has(m.id))) return null;

  const { data: inEvent } = await supabase
    .from("event_players")
    .select("player_id")
    .eq("event_id", eventId)
    .in(
      "player_id",
      matches.map((m) => m.id),
    );
  const inEventIds = new Set((inEvent ?? []).map((r) => r.player_id));

  return {
    error: "",
    duplicates: matches.map((m) => ({ ...m, inEvent: inEventIds.has(m.id) })),
    values: submittedValues(formData),
  };
}

// Adds a player to an event (no-op if they're already there).
async function addToEvent(supabase: Supabase, eventId: string, playerId: string, jersey_number: string | null) {
  const { error } = await supabase
    .from("event_players")
    .upsert({ event_id: eventId, player_id: playerId, jersey_number }, { onConflict: "event_id,player_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function createPlayer(
  eventId: string,
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const { row, jersey_number, fieldErrors } = parsePlayer(formData);
  const supabase = await createAuthedClient();

  // "Add this existing player to the event" from the duplicate warning.
  const linkTo = String(formData.get("link_player") ?? "");
  if (UUID.test(linkTo)) {
    await addToEvent(supabase, eventId, linkTo, jersey_number);
    revalidateEvents();
    redirect(eventPlayerPath(eventId, linkTo));
  }

  if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors, formData);

  const duplicate = await checkDuplicates(supabase, eventId, row, formData);
  if (duplicate) return duplicate;

  const { data, error } = await supabase
    .from("players")
    .insert({ ...row, status_event_id: eventId })
    .select("id")
    .single();
  if (error) return { error: error.message, values: submittedValues(formData) };

  try {
    await addToEvent(supabase, eventId, data.id, jersey_number);
  } catch {
    // Don't leave a player that isn't in any event.
    await supabase.from("players").delete().eq("id", data.id);
    return { error: "Couldn't add the player to this event. Try again.", values: submittedValues(formData) };
  }

  revalidateEvents();
  redirect(eventPlayerPath(eventId, data.id));
}

export async function updatePlayer(
  eventId: string,
  playerId: string,
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const { row, jersey_number, fieldErrors } = parsePlayer(formData);
  if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors, formData);

  const supabase = await createAuthedClient();

  // Only warn when this edit changes the name or grad year; otherwise any
  // match was already there (and already flagged on the player list).
  const { data: saved } = await supabase
    .from("players")
    .select("first_name, last_name, grad_year")
    .eq("id", playerId)
    .single<{ first_name: string; last_name: string; grad_year: number | null }>();
  if (!saved || duplicateKey(saved) !== duplicateKey(row)) {
    const duplicate = await checkDuplicates(supabase, eventId, row, formData, playerId);
    if (duplicate) return duplicate;
  }

  const [{ error }, { error: jerseyError }] = await Promise.all([
    supabase.from("players").update(row).eq("id", playerId),
    // The jersey number belongs to this event only.
    supabase.from("event_players").update({ jersey_number }).eq("event_id", eventId).eq("player_id", playerId),
  ]);
  if (error || jerseyError) {
    return { error: (error ?? jerseyError)!.message, values: submittedValues(formData) };
  }

  revalidateEvents();
  redirect(eventPlayerPath(eventId, playerId));
}

// ---------------------------------------------------------------------------
// Overall status (tagged with the event it was set at)
// ---------------------------------------------------------------------------

export async function updatePlayerStatus(eventId: string, playerId: string, status: LifecycleStatus) {
  if (!isLifecycleStatus(status)) {
    throw new Error("Invalid status");
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase
    .from("players")
    .update({ lifecycle_status: status, status_event_id: eventId })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  revalidateEvents();
}

// ---------------------------------------------------------------------------
// Traffic-light rating (per event)
// ---------------------------------------------------------------------------

const STATUS_FOR_RATING: Partial<Record<TrafficLight, LifecycleStatus>> = {
  yellow: "watch_again",
  red: "archived",
};

// Everything needed to reverse one rating and its follow-up, kept by the
// browser for the rest of the visit.
export type RatingReceipt = {
  evaluationId: string;
  rating: TrafficLight;
  // Overall status (and the event it was tagged with) before the rating.
  previousStatus: LifecycleStatus;
  previousStatusEventId: string | null;
  // Status the app last set for this rating (after any follow-up). Undo only
  // restores the previous status if nobody has changed it since.
  expectedStatus: LifecycleStatus;
  // Tasks the rating's follow-up created, removed on undo.
  taskIds: string[];
};

// Records a rating at this event, stores it as the player's rating for this
// event, and moves Yellow/Red players to their next overall stage (tagged with
// this event). Returns what undoRating needs to reverse it, or null when the
// player already has this rating at this event.
export async function ratePlayer(
  eventId: string,
  playerId: string,
  rating: TrafficLight,
): Promise<RatingReceipt | null> {
  if (!isTrafficLight(rating)) {
    throw new Error("Invalid rating");
  }

  const supabase = await createAuthedClient();

  const [{ data: appearance, error: appearanceError }, { data: player, error: playerError }] = await Promise.all([
    supabase
      .from("event_players")
      .select("traffic_light")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .single<{ traffic_light: TrafficLight | null }>(),
    supabase
      .from("players")
      .select("lifecycle_status, status_event_id")
      .eq("id", playerId)
      .single<{ lifecycle_status: LifecycleStatus; status_event_id: string | null }>(),
  ]);
  if (appearanceError) throw new Error(appearanceError.message);
  if (playerError) throw new Error(playerError.message);
  if (appearance.traffic_light === rating) return null;

  const { data: evaluation, error: evalError } = await supabase
    .from("evaluations")
    .insert({ event_id: eventId, player_id: playerId, traffic_light_rating: rating })
    .select("id")
    .single();
  if (evalError) throw new Error(evalError.message);

  const status = STATUS_FOR_RATING[rating];
  const [{ error }, { error: statusError }] = await Promise.all([
    supabase.from("event_players").update({ traffic_light: rating }).eq("event_id", eventId).eq("player_id", playerId),
    status
      ? supabase.from("players").update({ lifecycle_status: status, status_event_id: eventId }).eq("id", playerId)
      : Promise.resolve({ error: null }),
  ]);
  if (error || statusError) throw new Error((error ?? statusError)!.message);

  revalidateEvents();
  return {
    evaluationId: evaluation.id,
    rating,
    previousStatus: player.lifecycle_status,
    previousStatusEventId: player.status_event_id,
    expectedStatus: status ?? player.lifecycle_status,
    taskIds: [],
  };
}

// Reverses a rating and its follow-up: deletes that evaluation and any task
// the follow-up created, falls back to the player's previous rating at this
// event (or none), and restores their previous overall status if nobody has
// changed it since.
export async function undoRating(eventId: string, playerId: string, receipt: RatingReceipt) {
  if (!isLifecycleStatus(receipt.previousStatus) || !isLifecycleStatus(receipt.expectedStatus)) {
    throw new Error("Invalid status");
  }
  const previousStatusEventId =
    typeof receipt.previousStatusEventId === "string" && UUID.test(receipt.previousStatusEventId)
      ? receipt.previousStatusEventId
      : null;
  const taskIds = Array.isArray(receipt.taskIds)
    ? receipt.taskIds.filter((id) => typeof id === "string").slice(0, 5)
    : [];

  const supabase = await createAuthedClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", receipt.evaluationId)
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);
  if (!deleted?.length) throw new Error("This rating was already undone or can't be undone.");

  if (taskIds.length > 0) {
    const { error: taskError } = await supabase
      .from("tasks")
      .delete()
      .in("id", taskIds)
      .eq("player_id", playerId)
      .eq("status", "open");
    if (taskError) throw new Error(taskError.message);
  }

  const [{ data: latest, error: latestError }, { data: player, error: playerError }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("traffic_light_rating")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .not("traffic_light_rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ traffic_light_rating: TrafficLight }>(),
    supabase.from("players").select("lifecycle_status").eq("id", playerId).single<{ lifecycle_status: LifecycleStatus }>(),
  ]);
  if (latestError) throw new Error(latestError.message);
  if (playerError) throw new Error(playerError.message);

  const restoreStatus = player.lifecycle_status === receipt.expectedStatus;

  const [{ error }, { error: statusError }] = await Promise.all([
    supabase
      .from("event_players")
      .update({ traffic_light: latest?.traffic_light_rating ?? null })
      .eq("event_id", eventId)
      .eq("player_id", playerId),
    restoreStatus
      ? supabase
          .from("players")
          .update({ lifecycle_status: receipt.previousStatus, status_event_id: previousStatusEventId })
          .eq("id", playerId)
      : Promise.resolve({ error: null }),
  ]);
  if (error || statusError) throw new Error((error ?? statusError)!.message);

  revalidateEvents();
}

// Green follow-up: "Queue for Outreach". Returns what undo needs.
export async function queueForOutreach(eventId: string, playerId: string) {
  const supabase = await createAuthedClient();

  const { error } = await supabase
    .from("players")
    .update({ lifecycle_status: "to_be_contacted", status_event_id: eventId })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  const taskId = await addOpenTask(supabase, playerId, "outreach");
  revalidateEvents();
  return { status: "to_be_contacted" as LifecycleStatus, taskId };
}

// Yellow follow-up: "Request Film & Info". Saved as an open task for now;
// sending the actual request comes later.
export async function requestFilmAndInfo(playerId: string) {
  const supabase = await createAuthedClient();
  const taskId = await addOpenTask(supabase, playerId, "request_film");
  revalidateEvents();
  return { taskId };
}

// Adds an open task unless the player already has an open one of that type,
// so repeat taps don't pile up duplicates. Returns the new task's id, or null
// if one already existed.
async function addOpenTask(supabase: Supabase, playerId: string, taskType: TaskType): Promise<string | null> {
  const { data: existing, error: findError } = await supabase
    .from("tasks")
    .select("id")
    .eq("player_id", playerId)
    .eq("task_type", taskType)
    .eq("status", "open")
    .limit(1);
  if (findError) throw new Error(findError.message);
  if (existing.length > 0) return null;

  const { data, error } = await supabase
    .from("tasks")
    .insert({ player_id: playerId, task_type: taskType })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
