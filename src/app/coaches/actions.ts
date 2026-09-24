"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalid, isEmail, submittedValues, text, type FormState } from "@/lib/form";
import { createAuthedClient } from "@/lib/supabase/server";

export type CoachFormState = FormState;

const NOTES_MAX = 5000;

// Turns form fields into a coaches row, or returns per-field errors.
function parseCoach(formData: FormData) {
  const fieldErrors: Record<string, string> = {};

  const first_name = text(formData, "first_name");
  const last_name = text(formData, "last_name");
  if (!first_name) fieldErrors.first_name = "Required";
  if (!last_name) fieldErrors.last_name = "Required";

  const email = text(formData, "email");
  if (email && !isEmail(email)) fieldErrors.email = "Enter a valid email";

  const notes = text(formData, "notes");
  if (notes && notes.length > NOTES_MAX) {
    fieldErrors.notes = `Keep notes under ${NOTES_MAX.toLocaleString()} characters`;
  }

  const row = {
    first_name: first_name ?? "",
    last_name: last_name ?? "",
    title: text(formData, "title"),
    email,
    cell_phone: text(formData, "cell_phone"),
    office_phone: text(formData, "office_phone"),
    notes,
  };

  return { row, fieldErrors };
}

export async function createCoach(
  _prev: CoachFormState,
  formData: FormData,
): Promise<CoachFormState> {
  const { row, fieldErrors } = parseCoach(formData);
  if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors, formData);

  const supabase = await createAuthedClient();
  const { data, error } = await supabase.from("coaches").insert(row).select("id").single();
  if (error) return { error: error.message, values: submittedValues(formData) };

  revalidatePath("/coaches");
  redirect(`/coaches/${data.id}`);
}

export async function updateCoach(
  id: string,
  _prev: CoachFormState,
  formData: FormData,
): Promise<CoachFormState> {
  const { row, fieldErrors } = parseCoach(formData);
  if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors, formData);

  const supabase = await createAuthedClient();
  const { error } = await supabase.from("coaches").update(row).eq("id", id);
  if (error) return { error: error.message, values: submittedValues(formData) };

  revalidatePath("/coaches");
  revalidatePath(`/coaches/${id}`);
  redirect(`/coaches/${id}`);
}
