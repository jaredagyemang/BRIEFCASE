import { extractInfoCards, searchDocketCards, searchGmailCards } from "@/lib/gmail/docket";

// The Docket's search. A route rather than Server Actions so a search runs
// straight away, not queued behind the Info cards the home screen is reading.
//   { kind: "docket", q }  cards Briefcase has already read
//   { kind: "gmail", q }   the whole mailbox, on the coach's request
//   { kind: "read", ids }  Info cards for emails just found in Gmail
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const q = typeof body?.q === "string" ? body.q : "";
  switch (body?.kind) {
    case "docket":
      return Response.json(await searchDocketCards(q));
    case "gmail":
      return Response.json(await searchGmailCards(q));
    case "read": {
      const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
      return Response.json(await extractInfoCards(ids));
    }
    default:
      return Response.json({ error: "Unknown search." }, { status: 400 });
  }
}
