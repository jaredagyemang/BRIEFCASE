import { CoachForm } from "@/components/coach-form";
import { updateCoach } from "../../actions";
import { getCoach } from "../data";

export default async function EditCoachPage({ params }: PageProps<"/coaches/[id]/edit">) {
  const { id } = await params;
  const coach = await getCoach(id);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Edit coach</h1>
      <CoachForm
        action={updateCoach.bind(null, coach.id)}
        coach={coach}
        submitLabel="Save"
        cancelHref={`/coaches/${coach.id}`}
      />
    </div>
  );
}
