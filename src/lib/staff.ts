import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  // False when this login has no staff profile yet (e.g. the staff
  // migration hasn't been run), so the name can't be edited.
  hasProfile: boolean;
};

// The signed-in user, or null when signed out. Works even without a staff
// profile, so navigation and sign-out never disappear.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const email = typeof claims.email === "string" ? claims.email : "";
  const { data: staff } = await supabase
    .from("staff")
    .select("full_name")
    .eq("id", claims.sub)
    .maybeSingle<{ full_name: string }>();

  return {
    id: claims.sub,
    email,
    name: staff?.full_name ?? (email.split("@")[0] || "Me"),
    hasProfile: Boolean(staff),
  };
});
