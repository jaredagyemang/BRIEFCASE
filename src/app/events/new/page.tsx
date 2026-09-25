import { EventForm } from "@/components/event-form";
import { createEvent } from "../actions";

export default function NewEventPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">New event</h1>
      <EventForm action={createEvent} submitLabel="Start event" cancelHref="/events" />
    </div>
  );
}
