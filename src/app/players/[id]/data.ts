import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Player } from "@/lib/players";

export const getPlayer = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle<Player>();
  if (!data) notFound();
  return data;
});
