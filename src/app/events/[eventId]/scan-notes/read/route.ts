import { readNotesPage } from "@/app/events/note-scan-server";
import { createAuthedClient } from "@/lib/supabase/server";

// Reads one page of a bulk notes scan (a photo in "photo") and returns its
// notes matched to the event's players. A route rather than a Server Action
// so the scanner can read several pages at once.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: RouteContext<"/events/[eventId]/scan-notes/read">) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) return Response.json({ ok: false, error: "Couldn't find that event." }, { status: 404 });

  let supabase;
  try {
    supabase = await createAuthedClient();
  } catch {
    return Response.json({ ok: false, error: "You've been signed out. Sign in again and retry." }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "No photo was received. Try again." }, { status: 400 });
  }
  return Response.json(await readNotesPage(supabase, eventId, form));
}
