"use server";

import { revalidatePath } from "next/cache";
import { disconnect, findLinksInRecentEmails } from "@/lib/gmail/connection";

// Reads the signed-in coach's recent emails and returns the ones with video
// or Google Doc links. Runs on the server; tokens never reach the browser.
export async function loadGmailLinks() {
  return findLinksInRecentEmails();
}

export async function disconnectGmail() {
  await disconnect();
  revalidatePath("/docket");
}
