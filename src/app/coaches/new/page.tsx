import { CoachForm } from "@/components/coach-form";
import { createCoach } from "../actions";

export default function NewCoachPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">New coach</h1>
      <CoachForm action={createCoach} submitLabel="Add coach" cancelHref="/coaches" />
    </div>
  );
}
