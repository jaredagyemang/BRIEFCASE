import { loadTeamActivity } from "@/lib/gmail/activity";

// Team activity for The Docket's home: { hours, before? }. A route rather
// than a Server Action so it loads straight away, not queued behind the Info
// cards the home screen is reading.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const hours = Number(body?.hours);
  const before = typeof body?.before === "string" ? body.before : null;
  return Response.json(await loadTeamActivity(hours, before));
}
