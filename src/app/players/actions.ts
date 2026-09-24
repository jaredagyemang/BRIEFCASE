"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthedClient } from "@/lib/supabase/server";
import { invalid, isEmail, submittedValues, text, type FormState } from "@/lib/form";
import {
  isLifecycleStatus,
  isTrafficLight,
  type LifecycleStatus,
  type TaskType,
  type TrafficLight,
} from "@/lib/players";

export type PlayerFormState = FormState;

// Turns form fields into a players row, or returns per-field errors.
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

  const gpaRaw = text(formData, "gpa");
  const gpa = gpaRaw ? Number(gpaRaw) : null;
  if (gpa !== null && !(gpa >= 0 && gpa <= 5)) {
    fieldErrors.gpa = "GPA must be between 0 and 5";
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

  return { row, fieldErrors };
}

export async function createPlayer(
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const { row, fieldErrors } = parsePlayer(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return invalid(fieldErrors, formData);
  }

  const supabase = await createAuthedClient();
  const { data, error } = await supabase
    .from("players")
    .insert(row)
    .select("id")
    .single();

  if (error) return { error: error.message, values: submittedValues(formData) };

  revalidatePath("/players");
  redirect(`/players/${data.id}`);
}

export async function updatePlayer(
  id: string,
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const { row, fieldErrors } = parsePlayer(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return invalid(fieldErrors, formData);
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase.from("players").update(row).eq("id", id);
  if (error) return { error: error.message, values: submittedValues(formData) };

  revalidatePath("/players");
  revalidatePath(`/players/${id}`);
  redirect(`/players/${id}`);
}

export async function updatePlayerStatus(id: string, status: LifecycleStatus) {
  if (!isLifecycleStatus(status)) {
    throw new Error("Invalid status");
  }

  const supabase = await createAuthedClient();
  const { error } = await supabase
    .from("players")
    .update({ lifecycle_status: status })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePlayer(id);
}

// ---------------------------------------------------------------------------
// Traffic-light rating
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
  // Status before the rating.
  previousStatus: LifecycleStatus;
  // Status the app last set for this rating (after any follow-up). Undo only
  // restores previousStatus if nobody has changed the status since.
  expectedStatus: LifecycleStatus;
  // Tasks the rating's follow-up created, removed on undo.
  taskIds: string[];
};

// Records a rating as a new evaluation, stores it on the player as their
// latest rating, and moves Yellow/Red players to their next stage. Returns
// what undoRating needs to reverse it, or null when the player already has
// this rating (tapping the current color never saves a duplicate).
export async function ratePlayer(
  playerId: string,
  rating: TrafficLight,
): Promise<RatingReceipt | null> {
  if (!isTrafficLight(rating)) {
    throw new Error("Invalid rating");
  }

  const supabase = await createAuthedClient();

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("lifecycle_status, traffic_light")
    .eq("id", playerId)
    .single<{ lifecycle_status: LifecycleStatus; traffic_light: TrafficLight | null }>();
  if (playerError) throw new Error(playerError.message);
  if (player.traffic_light === rating) return null;

  const { data: evaluation, error: evalError } = await supabase
    .from("evaluations")
    .insert({ player_id: playerId, traffic_light_rating: rating })
    .select("id")
    .single();
  if (evalError) throw new Error(evalError.message);

  const status = STATUS_FOR_RATING[rating];
  const { error } = await supabase
    .from("players")
    .update({ traffic_light: rating, ...(status && { lifecycle_status: status }) })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  revalidatePlayer(playerId);
  return {
    evaluationId: evaluation.id,
    rating,
    previousStatus: player.lifecycle_status,
    expectedStatus: status ?? player.lifecycle_status,
    taskIds: [],
  };
}

// Reverses a rating and its follow-up: deletes that evaluation and any task
// the follow-up created, falls back to the player's previous rating (or none),
// and restores their previous status if nobody has changed it since.
export async function undoRating(playerId: string, receipt: RatingReceipt) {
  if (!isLifecycleStatus(receipt.previousStatus) || !isLifecycleStatus(receipt.expectedStatus)) {
    throw new Error("Invalid status");
  }
  const taskIds = Array.isArray(receipt.taskIds)
    ? receipt.taskIds.filter((id) => typeof id === "string").slice(0, 5)
    : [];

  const supabase = await createAuthedClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", receipt.evaluationId)
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

  const [{ data: latest, error: latestError }, { data: player, error: playerError }] =
    await Promise.all([
      supabase
        .from("evaluations")
        .select("traffic_light_rating")
        .eq("player_id", playerId)
        .not("traffic_light_rating", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ traffic_light_rating: TrafficLight }>(),
      supabase
        .from("players")
        .select("lifecycle_status")
        .eq("id", playerId)
        .single<{ lifecycle_status: LifecycleStatus }>(),
    ]);
  if (latestError) throw new Error(latestError.message);
  if (playerError) throw new Error(playerError.message);

  const restoreStatus = player.lifecycle_status === receipt.expectedStatus;

  const { error } = await supabase
    .from("players")
    .update({
      traffic_light: latest?.traffic_light_rating ?? null,
      ...(restoreStatus && { lifecycle_status: receipt.previousStatus }),
    })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  revalidatePlayer(playerId);
}

// Green follow-up: "Queue for Outreach". Returns what undo needs.
export async function queueForOutreach(playerId: string) {
  const supabase = await createAuthedClient();

  const { error } = await supabase
    .from("players")
    .update({ lifecycle_status: "to_be_contacted" })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  const taskId = await addOpenTask(supabase, playerId, "outreach");
  revalidatePlayer(playerId);
  return { status: "to_be_contacted" as LifecycleStatus, taskId };
}

// Yellow follow-up: "Request Film & Info". Saved as an open task for now;
// sending the actual request comes later.
export async function requestFilmAndInfo(playerId: string) {
  const supabase = await createAuthedClient();
  const taskId = await addOpenTask(supabase, playerId, "request_film");
  revalidatePlayer(playerId);
  return { taskId };
}

type Supabase = Awaited<ReturnType<typeof createAuthedClient>>;

// Adds an open task unless the player already has an open one of that type,
// so repeat taps don't pile up duplicates. Returns the new task's id, or null
// if one already existed.
async function addOpenTask(
  supabase: Supabase,
  playerId: string,
  taskType: TaskType,
): Promise<string | null> {
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

function revalidatePlayer(playerId: string) {
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
}
