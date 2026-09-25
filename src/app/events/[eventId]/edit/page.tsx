import { DeleteEventButton } from "@/components/delete-event-button";
import { EventForm } from "@/components/event-form";
import { eventPath } from "@/lib/events";
import { getEvent } from "@/lib/events-server";
import { updateEvent } from "../../actions";

export default async function EditEventPage({ params }: PageProps<"/events/[eventId]/edit">) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Edit event</h1>
      <EventForm
        action={updateEvent.bind(null, event.id)}
        name={event.name}
        eventDate={event.event_date}
        submitLabel="Save"
        cancelHref={eventPath(event.id)}
      />
      <div className="mt-10 border-t border-border pt-6">
        <DeleteEventButton eventId={event.id} eventName={event.name} variant="full" />
      </div>
    </div>
  );
}
