"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthedClient } from "@/lib/supabase/server";
import {
  isLifecycleStatus,
  isTrafficLight,
  type LifecycleStatus,
  type TaskType,
  type TrafficLight,
} from "@/lib/players";

export type PlayerFormState =
  | {
      error: string;
      fieldErrors?: Record<string, string>;
      // Echoed back so the form keeps what was typed after React resets it.
      values: Record<string, string>;
    }
  | undefined;

function submittedValues(formData: FormData) {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  });
  return values;
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

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
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
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
    return { error: "Please fix the highlighted fields.", fieldErrors, values: submittedValues(formData) };
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
    return { error: "Please fix the highlighted fields.", fieldErrors, values: submittedValues(formData) };
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

export type RatingReceipt = {
  evaluationId: string;
  previousStatus: LifecycleStatus;
};

// Records a rating as a new evaluation, stores it on the player as their
// latest rating, and moves Yellow/Red players to their next stage. Returns
// what undoRating needs to reverse it.
export async function ratePlayer(playerId: string, rating: TrafficLight): Promise<RatingReceipt> {
  if (!isTrafficLight(rating)) {
    throw new Error("Invalid rating");
  }

  const supabase = await createAuthedClient();

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("lifecycle_status")
    .eq("id", playerId)
    .single<{ lifecycle_status: LifecycleStatus }>();
  if (playerError) throw new Error(playerError.message);

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
  return { evaluationId: evaluation.id, previousStatus: player.lifecycle_status };
}

// Reverses a rating made by mistake: deletes that evaluation, falls back to
// the player's previous rating, and restores their status if the rating
// changed it (and nobody has changed it again since).
export async function undoRating(playerId: string, receipt: RatingReceipt) {
  if (!isLifecycleStatus(receipt.previousStatus)) {
    throw new Error("Invalid status");
  }

  const supabase = await createAuthedClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", receipt.evaluationId)
    .eq("player_id", playerId)
    .select("traffic_light_rating")
    .maybeSingle<{ traffic_light_rating: TrafficLight | null }>();
  if (deleteError) throw new Error(deleteError.message);
  if (!deleted) return; // Already undone.

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

  const statusSetByRating = deleted.traffic_light_rating
    ? STATUS_FOR_RATING[deleted.traffic_light_rating]
    : undefined;
  const restoreStatus = statusSetByRating && player.lifecycle_status === statusSetByRating;

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

// Green follow-up: "Queue for Outreach".
export async function queueForOutreach(playerId: string) {
  const supabase = await createAuthedClient();

  const { error } = await supabase
    .from("players")
    .update({ lifecycle_status: "to_be_contacted" })
    .eq("id", playerId);
  if (error) throw new Error(error.message);

  await addOpenTask(supabase, playerId, "outreach");
  revalidatePlayer(playerId);
}

// Yellow follow-up: "Request Film & Info". Saved as an open task for now;
// sending the actual request comes later.
export async function requestFilmAndInfo(playerId: string) {
  const supabase = await createAuthedClient();
  await addOpenTask(supabase, playerId, "request_film");
  revalidatePlayer(playerId);
}

type Supabase = Awaited<ReturnType<typeof createAuthedClient>>;

// Adds an open task unless the player already has an open one of that type,
// so repeat taps don't pile up duplicates.
async function addOpenTask(supabase: Supabase, playerId: string, taskType: TaskType) {
  const { data: existing, error: findError } = await supabase
    .from("tasks")
    .select("id")
    .eq("player_id", playerId)
    .eq("task_type", taskType)
    .eq("status", "open")
    .limit(1);
  if (findError) throw new Error(findError.message);
  if (existing.length > 0) return;

  const { error } = await supabase
    .from("tasks")
    .insert({ player_id: playerId, task_type: taskType });
  if (error) throw new Error(error.message);
}

function revalidatePlayer(playerId: string) {
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
}
