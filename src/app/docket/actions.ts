"use server";

import { revalidatePath } from "next/cache";
import { disconnect } from "@/lib/gmail/connection";
import {
  SNAPSHOT_TABLE,
  checkSpamEmails,
  extractInfoCards,
  loadDocket,
  sendReply,
  setShared,
  setShortlisted,
  setSkipped,
  trashEmail,
  type SnapshotList,
} from "@/lib/gmail/docket";
import type { ReplyTemplate } from "@/lib/gmail/docket-types";
import { createAuthedClient } from "@/lib/supabase/server";

// The Docket's server actions. Gmail tokens and email contents stay on the
// server; the screens only get what they show.

export async function loadDocketAction(options?: { spam?: boolean }) {
  return loadDocket({ spam: options?.spam === true });
}

export async function checkSpamAction(messageIds: string[]) {
  return checkSpamEmails(Array.isArray(messageIds) ? messageIds.filter((id) => typeof id === "string") : []);
}

export async function extractInfoCardsAction(messageIds: string[]) {
  return extractInfoCards(messageIds);
}

export async function skipAction(messageId: string, threadId: string, skipped: boolean) {
  await setSkipped(messageId, threadId, skipped);
}

export async function deleteEmailAction(messageId: string, threadId: string) {
  return trashEmail(messageId, threadId);
}

export async function sendReplyAction(messageId: string, template: ReplyTemplate, body: string) {
  return sendReply(messageId, template, body);
}

export async function shortlistAction(messageId: string, shortlisted: boolean) {
  await setShortlisted(messageId, shortlisted);
  revalidatePath("/docket/shortlist");
}

export async function shareAction(messageId: string, shared: boolean, note?: string | null) {
  await setShared(messageId, shared, typeof note === "string" ? note : null);
  revalidatePath("/docket/shared");
}

const LIST_PATH: Record<SnapshotList, string> = { shortlist: "/docket/shortlist", shared: "/docket/shared" };

// From the Shortlist or "Shared with team" page: any coach can remove an item.
export async function removeFromListAction(list: SnapshotList, id: string) {
  if (!(list in SNAPSHOT_TABLE)) throw new Error("Unknown list");
  const supabase = await createAuthedClient();
  const { error } = await supabase.from(SNAPSHOT_TABLE[list]).delete().eq("id", id);
  if (error) throw new Error(`Couldn't remove it: ${error.message}`);
  revalidatePath(LIST_PATH[list]);
}

export async function disconnectGmail() {
  await disconnect();
  revalidatePath("/docket");
}
