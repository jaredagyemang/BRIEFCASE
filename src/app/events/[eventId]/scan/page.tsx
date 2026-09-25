import { RosterScanner } from "@/components/roster-scanner";
import { getEvent } from "@/lib/events-server";

export default async function ScanRosterPage({ params }: PageProps<"/events/[eventId]/scan">) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return <RosterScanner eventId={event.id} eventName={event.name} />;
}
