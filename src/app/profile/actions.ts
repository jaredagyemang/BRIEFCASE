"use server";

import { revalidatePath } from "next/cache";
import { createAuthedClient } from "@/lib/supabase/server";

export type NameState = { error?: string; saved?: boolean; name: string } | undefined;

export async function updateMyName(_prev: NameState, formData: FormData): Promise<NameState> {
  const name = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Enter your name", name };
  if (name.length > 80) return { error: "That name is too long", name };

  const supabase = await createAuthedClient();
  const { data } = await supabase.auth.getClaims();
  const { data: updated, error } = await supabase
    .from("staff")
    .update({ full_name: name })
    .eq("id", data!.claims.sub)
    .select("id");
  if (error) return { error: error.message, name };
  if (!updated?.length) {
    return { error: "Your staff profile isn't set up yet. Ask an admin to run the latest database update.", name };
  }

  // Names appear in the tab bar and on every player's rating history.
  revalidatePath("/", "layout");
  return { saved: true, name };
}
