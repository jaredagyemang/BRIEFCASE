"use server";

import { revalidatePath } from "next/cache";
import { disconnect } from "@/lib/gmail/connection";
import { extractInfoCards, loadDocket, sendReply, setShortlisted, setSkipped } from "@/lib/gmail/docket";
import type { ReplyTemplate } from "@/lib/gmail/docket-types";
import { createAuthedClient } from "@/lib/supabase/server";

// The Docket's server actions. Gmail tokens and email contents stay on the
// server; the screens only get what they show.

export async function loadDocketAction() {
  return loadDocket();
}

export async function extractInfoCardsAction(messageIds: string[]) {
  return extractInfoCards(messageIds);
}

export async function skipAction(messageId: string, threadId: string, skipped: boolean) {
  await setSkipped(messageId, threadId, skipped);
}

export async function sendReplyAction(messageId: string, template: ReplyTemplate, body: string) {
  return sendReply(messageId, template, body);
}

export async function shortlistAction(messageId: string, shortlisted: boolean) {
  await setShortlisted(messageId, shortlisted);
  revalidatePath("/docket/shortlist");
}

// From the shared Shortlist page: any coach can remove a player.
export async function removeFromShortlistAction(id: string) {
  const supabase = await createAuthedClient();
  const { error } = await supabase.from("shortlist").delete().eq("id", id);
  if (error) throw new Error(`Couldn't remove from the Shortlist: ${error.message}`);
  revalidatePath("/docket/shortlist");
}

export async function disconnectGmail() {
  await disconnect();
  revalidatePath("/docket");
}
