"use server";

import { revalidatePath } from "next/cache";
import { createAuthedClient } from "@/lib/supabase/server";

export type AccountState = { error?: string; saved?: boolean; name: string } | undefined;

export async function updateMyName(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const name = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Enter your name", name };
  if (name.length > 80) return { error: "That name is too long", name };

  const supabase = await createAuthedClient();
  const { data } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("staff")
    .update({ full_name: name })
    .eq("id", data!.claims.sub);
  if (error) return { error: error.message, name };

  // Names appear in the header and on every player's rating history.
  revalidatePath("/", "layout");
  return { saved: true, name };
}
