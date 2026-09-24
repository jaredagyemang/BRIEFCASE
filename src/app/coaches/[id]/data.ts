import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Coach } from "@/lib/coaches";

export const getCoach = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("coaches").select("*").eq("id", id).maybeSingle<Coach>();
  if (!data) notFound();
  return data;
});
