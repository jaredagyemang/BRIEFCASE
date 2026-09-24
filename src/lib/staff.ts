import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Staff = { id: string; full_name: string };

// The signed-in staff member's profile, or null when signed out.
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle<Staff>();
  return staff;
});
