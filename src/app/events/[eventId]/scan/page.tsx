import { RosterScanner } from "@/components/roster-scanner";
import { getEvent } from "@/lib/events-server";

// Add players from a roster: a photo (default) or, with ?source=link, a link
// to a roster web page or Google Doc.
export default async function ScanRosterPage({ params, searchParams }: PageProps<"/events/[eventId]/scan">) {
  const { eventId } = await params;
  const { source } = await searchParams;
  const event = await getEvent(eventId);
  return (
    <RosterScanner
      key={source === "link" ? "link" : "photo"}
      eventId={event.id}
      eventName={event.name}
      initialSource={source === "link" ? "link" : "photo"}
    />
  );
}
