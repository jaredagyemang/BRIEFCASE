"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthedClient } from "@/lib/supabase/server";
import { isLifecycleStatus, type LifecycleStatus } from "@/lib/players";

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

  revalidatePath("/players");
  revalidatePath(`/players/${id}`);
}
